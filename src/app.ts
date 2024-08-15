import express, { ErrorRequestHandler, RequestHandler } from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { JsonResponse } from "./types";
import moment from "moment";
import { HttpStatusCode } from "types/http";
import { loadSequelize } from "./db";
import { Sequelize } from "sequelize";
import useragent from "express-useragent";

import { decrypt } from "./utils";
import { configuration } from "./config";

import { AccessTokenService } from "services/accessToken";
import { AccessTokenRepository } from "services/accessToken/accessToken.repository";
const accessTokenRepository = new AccessTokenRepository();
const accessTokenService = new AccessTokenService(accessTokenRepository);

import { UserService } from "services/user";
import { UserRepository } from "services/user/user.repository";
import { AUTH_USER_API, HEALTH, NEW_USER_API } from "data/route";
const userRepository = new UserRepository();
const userService = new UserService(userRepository);

export const sequelizeManager: { sequelize: Sequelize | any } = {
  sequelize: null,
};

export const initSQL = async (
  dbHost: string,
  dbPort: number,
  dbName: string,
  dbUsn: string,
  dbPwd: string,
  maxConn: number,
  modelConfig: (seq: Sequelize) => void,
  isEnableSqlLog: boolean
) => {
  if (!sequelizeManager.sequelize) {
    sequelizeManager.sequelize = await loadSequelize(
      dbHost,
      dbPort,
      dbName,
      dbUsn,
      dbPwd,
      maxConn,
      isEnableSqlLog
    );
    !!modelConfig && modelConfig(sequelizeManager.sequelize);
    console.log("db initialized...")
    try {
      await sequelizeManager.sequelize.authenticate();
      console.log('db connection established...');
    } catch (error) {
      console.error('unable to connect to the database:', error);
    }
  } else {
    sequelizeManager.sequelize.connectionManager.initPools();
    if (
      sequelizeManager.sequelize.connectionManager.hasOwnProperty(
        "getConnection"
      )
    ) {
      delete sequelizeManager.sequelize.connectionManager.getConnection;
    }
  }
};

export class App {
  routeMap: Record<string, { handler: RequestHandler }> = {};
  apiPrefix = "";
  version = "";
  serviceName = "";
  dbHost = "";
  dbPort = 3306;
  dbName = "";
  dbUsn = "";
  dbPwd = "";
  maxConn = 3;
  modelConfig: (seq: Sequelize) => void;
  isEnableSqlLog = false;
  requestLog = false;
  app: express.Application;

  constructor(
    apiPrefix: string,
    version: string,
    serviceName: string,
    dbHost: string,
    dbPort: number,
    dbName: string,
    dbUsn: string,
    dbPwd: string,
    maxConn: number,
    modelConfig: (seq: Sequelize) => void,
    isEnableSqlLog: boolean,
    requestLog: boolean
  ) {
    this.apiPrefix = apiPrefix;
    this.version = version;
    this.serviceName = serviceName;
    this.dbHost = dbHost;
    this.dbPort = dbPort;
    this.dbName = dbName;
    this.dbUsn = dbUsn;
    this.dbPwd = dbPwd;
    this.maxConn = maxConn;
    this.modelConfig = modelConfig;
    this.isEnableSqlLog = isEnableSqlLog;
    this.requestLog = requestLog;
  }

  initHttp = (app: express.Application) => {
    this.route(HEALTH, this.healthCheck);

    app.use(cors({ origin: "*" }));
    app.use(bodyParser.json());
    app.use(useragent.express());

    for (const routePath in this.routeMap) {
      if (
        [
          this.apiPrefix + HEALTH,
          this.apiPrefix + NEW_USER_API,
          this.apiPrefix + AUTH_USER_API
        ].includes(routePath)
      ) {
        app.use(routePath, this.routeMap[routePath].handler);
      } else {
        app.use(routePath, this.authMiddleware, this.routeMap[routePath].handler);
      }
    }

    app.use(this.globalErrorHandler);
    app.use(this.apiErrorHandler);
    app.listen(process.env.PORT || 3010, () => {
      console.log(`listening on port: ${process.env.PORT || 3010}`);
    });
  };

  start = (app: express.Application) => {
    try {
      initSQL(
        this.dbHost,
        this.dbPort,
        this.dbName,
        this.dbUsn,
        this.dbPwd,
        this.maxConn,
        this.modelConfig,
        process.env.ENABLE_DB_LOGGING == "true" || false
      );
      this.app = app;
      this.initHttp(app);
    } catch (e) {
      console.error(
        `Server process failed to initialize.\n${JSON.stringify(e)}`
      );
      process.exit(1);
    }
  };

  route = (path: string, funcHandler: RequestHandler): void => {
    this.routeMap[this.apiPrefix + path] = {
      handler: funcHandler,
    };
  };

  authMiddleware: RequestHandler = async (req, res, next): Promise<void> => {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) {
      res
        .status(HttpStatusCode.UNAUTHORIZED)
        .send({ status: 0, message: "invalid or missing token!" });
      return;
    }

    try {
      const decToken = decrypt(token as string, Buffer.from(configuration.encryptionKey, "base64"))
      const user = await userService.getUserById(decToken)
      if (!user) {
        res
          .status(HttpStatusCode.UNAUTHORIZED)
          .send({ status: 0, message: "invalid token!" });
        return;
      }

      const acsTkn = await accessTokenService.getAccessToken({ where: { token: token as string, user_id: user.id, invalidated: false } })
      if (!acsTkn) {
        res
          .status(HttpStatusCode.UNAUTHORIZED)
          .send({ status: 0, message: "invalid token!" });
        return;
      }

      const hasExpired = moment(acsTkn.expiry).isSameOrBefore(moment().toDate());
      if (hasExpired) {
        res
          .status(HttpStatusCode.UNAUTHORIZED)
          .send({ status: 0, message: "expired token!" });
        return;
      }
      next();
    } catch (error) {
      res
        .status(HttpStatusCode.UNAUTHORIZED)
        .send({ status: 0, message: "invalid token!" });
      return;
    }
  };

  globalErrorHandler: RequestHandler = (req, res, next): void => {
    res.setHeader("Content-type", "application/problem+json");
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .send({ url: req.originalUrl, error: "not-found" });
    next();
  };

  apiErrorHandler: ErrorRequestHandler = (err, req, res, next): void => {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .send({ status: 3, message: JSON.stringify(err) });
  };

  healthCheck: RequestHandler = (req, res, next): JsonResponse => {
    return res.status(200).json({
      name: this.serviceName,
      version: this.version,
      db: {
        host: this.dbHost,
        port: this.dbPort,
        dbName: this.dbName,
        usn: this.dbUsn,
      },
      time: moment().toISOString(),
    });
  };
}
