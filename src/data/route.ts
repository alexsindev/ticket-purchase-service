const EVENT_PREFIX = "/event";
const NEW_EVENT_API = EVENT_PREFIX + "/new";
const GET_EVENT_DETAILS_API = EVENT_PREFIX + "/detail";
const LIST_EVENTS_API = EVENT_PREFIX + "/list";
const EDIT_EVENT_DETAILS_API = EVENT_PREFIX + "/edit";
const GET_EVENT_TICKETS_API = EVENT_PREFIX + "/tickets"

const TICKET_PREFIX = "/ticket";
const PURCHASE_TICKET_API = TICKET_PREFIX + "/purchase";
const EDIT_TICKET_CATEGORY_DETAILS_API = TICKET_PREFIX + "/category/edit"

const USER_PREFIX = "/user";
const NEW_USER_API = USER_PREFIX + "/new";
const AUTH_USER_API = USER_PREFIX + "/authenticate";
const GET_USER_PURCHASED_TICKETS = USER_PREFIX + "/tickets";

export {
  NEW_EVENT_API,
  GET_EVENT_DETAILS_API,
  LIST_EVENTS_API,
  EDIT_EVENT_DETAILS_API,
  GET_EVENT_TICKETS_API,
  PURCHASE_TICKET_API,
  NEW_USER_API,
  AUTH_USER_API,
  GET_USER_PURCHASED_TICKETS,
  EDIT_TICKET_CATEGORY_DETAILS_API
};
