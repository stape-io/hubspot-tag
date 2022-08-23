const sendHttpRequest = require('sendHttpRequest');
const encodeUriComponent = require('encodeUriComponent');
const getAllEventData = require('getAllEventData');
const JSON = require('JSON');
const getRequestHeader = require('getRequestHeader');

const logToConsole = require('logToConsole');
const getContainerVersion = require('getContainerVersion');
const isLoggingEnabled = determinateIsLoggingEnabled();
const traceId = getRequestHeader('trace-id');

let type = data.type;
const eventData = getAllEventData();


if (type === 'trackEventPageView') {
  trackEventPageView();
} else if (type === 'trackCustomBehavioralEvent') {
  trackCustomBehavioralEvent();
} else if (type === 'createOrUpdateContact') {
  createOrUpdateContact();
} else {
  data.gtmOnFailure();
}


function trackEventPageView() {
  let url = 'https://track.hubspot.com/__ptq.gif?ct=' + encodeUriComponent('standard-page');

  if (data.accountId) url + '&a=' + encodeUriComponent(data.accountId);
  if (eventData.page_referrer) url + '&r=' + encodeUriComponent(eventData.page_referrer);
  if (eventData.page_title) url + '&t=' + encodeUriComponent(eventData.page_title);
  if (eventData.page_location) url + '&pu=' + encodeUriComponent(eventData.page_location);
  if (eventData.screen_resolution) url + '&sd=' + encodeUriComponent(eventData.screen_resolution);

  if (isLoggingEnabled) {
    logToConsole(JSON.stringify({
      'Name': 'HubSpot',
      'Type': 'Request',
      'TraceId': traceId,
      'EventName': 'page_view',
      'RequestMethod': 'GET',
      'RequestUrl': url,
    }));
  }

  sendHttpRequest(url, (statusCode, headers, body) => {
    if (isLoggingEnabled) {
      logToConsole(JSON.stringify({
        'Name': 'HubSpot',
        'Type': 'Response',
        'TraceId': traceId,
        'EventName': 'page_view',
        'ResponseStatusCode': statusCode,
        'ResponseHeaders': headers,
        'ResponseBody': body,
      }));
    }

    if (statusCode >= 200 && statusCode < 300) {
      data.gtmOnSuccess();
    } else {
      data.gtmOnFailure();
    }
  }, {method: 'GET', timeout: 3500});
}


function trackCustomBehavioralEvent() {
  let url = 'https://api.hubapi.com/events/v3/send';
  let bodyData = {
    'eventName': data.customBehavioralEventEventName,
    'properties': mapProperties(data.customBehavioralEventParameters),
  };

  if (data.customBehavioralEventUtk) bodyData.utk = data.customBehavioralEventUtk;
  if (data.email) bodyData.email = data.email;
  if (data.customBehavioralEventObjectId) bodyData.objectId = data.customBehavioralEventObjectId;
  if (data.customBehavioralEventOccurredAt) bodyData.occurredAt = data.customBehavioralEventOccurredAt;

  if (isLoggingEnabled) {
    logToConsole(JSON.stringify({
      'Name': 'HubSpot',
      'Type': 'Request',
      'TraceId': traceId,
      'EventName': data.customBehavioralEventEventName,
      'RequestMethod': 'POST',
      'RequestUrl': url,
      'RequestBody': bodyData,
    }));
  }

  sendHttpRequest(url, (statusCode, headers, body) => {
    if (isLoggingEnabled) {
      logToConsole(JSON.stringify({
        'Name': 'HubSpot',
        'Type': 'Response',
        'TraceId': traceId,
        'EventName': data.customBehavioralEventEventName,
        'ResponseStatusCode': statusCode,
        'ResponseHeaders': headers,
        'ResponseBody': body,
      }));
    }

    if (statusCode >= 200 && statusCode < 300) {
      data.gtmOnSuccess();
    } else {
      data.gtmOnFailure();
    }
  }, {headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer '+data.apiKey}, method: 'POST'}, JSON.stringify(bodyData));
}

function createOrUpdateContact() {
  let url = 'https://api.hubapi.com/contacts/v1/contact/createOrUpdate/email/'+encodeUriComponent(data.email)+'/';
  let bodyData = {
    'properties': data.contactParameters
  };

  if (isLoggingEnabled) {
    logToConsole(JSON.stringify({
      'Name': 'HubSpot',
      'Type': 'Request',
      'TraceId': traceId,
      'EventName': 'contact_create_or_update',
      'RequestMethod': 'POST',
      'RequestUrl': url,
      'RequestBody': bodyData,
    }));
  }
  sendHttpRequest(url, (statusCode, headers, body) => {
    if (isLoggingEnabled) {
      logToConsole(JSON.stringify({
        'Name': 'HubSpot',
        'Type': 'Response',
        'TraceId': traceId,
        'EventName': 'contact_create_or_update',
        'ResponseStatusCode': statusCode,
        'ResponseHeaders': headers,
        'ResponseBody': body,
      }));
    }

    if (statusCode >= 200 && statusCode < 300) {
      data.gtmOnSuccess();
    } else {
      data.gtmOnFailure();
    }
  }, {headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer '+data.apiKey}, method: 'POST'}, JSON.stringify(bodyData));
}

function mapProperties(parameters) {
  let result = {};

  for (let parametersKey in parameters) {
    result[parameters[parametersKey].name] = parameters[parametersKey].value;
  }

  return result;
}

function determinateIsLoggingEnabled() {
  const containerVersion = getContainerVersion();
  const isDebug = !!(
      containerVersion &&
      (containerVersion.debugMode || containerVersion.previewMode)
  );

  if (!data.logType) {
    return isDebug;
  }

  if (data.logType === 'no') {
    return false;
  }

  if (data.logType === 'debug') {
    return isDebug;
  }

  return data.logType === 'always';
}
