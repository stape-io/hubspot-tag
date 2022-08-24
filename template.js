const sendHttpRequest = require('sendHttpRequest');
const encodeUriComponent = require('encodeUriComponent');
const getAllEventData = require('getAllEventData');
const JSON = require('JSON');
const getRequestHeader = require('getRequestHeader');
const makeTableMap = require('makeTableMap');
const makeInteger = require('makeInteger');

const logToConsole = require('logToConsole');
const getContainerVersion = require('getContainerVersion');
const isLoggingEnabled = determinateIsLoggingEnabled();
const traceId = getRequestHeader('trace-id');

let type = data.type;
const eventData = getAllEventData();


if (type === 'trackEventPageView') {
  trackPageViewEvent();
} else if (type === 'trackCustomBehavioralEvent') {
  trackCustomBehavioralEvent();
} else if (type === 'createOrUpdateContact') {
  createOrUpdateContactEvent();
} else if (type === 'ecommerce') {
  ecommerceEvent();
} else {
  data.gtmOnFailure();
}


function trackPageViewEvent() {
  let url = 'https://track.hubspot.com/__ptq.gif?ct=' + encodeUriComponent('standard-page');

  if (data.accountId) url + '&a=' + encodeUriComponent(data.accountId);
  if (eventData.page_referrer) url + '&r=' + encodeUriComponent(eventData.page_referrer);
  if (eventData.page_title) url + '&t=' + encodeUriComponent(eventData.page_title);
  if (eventData.page_location) url + '&pu=' + encodeUriComponent(eventData.page_location);
  if (eventData.screen_resolution) url + '&sd=' + encodeUriComponent(eventData.screen_resolution);

  logRequest('page_view', 'GET', url, {});

  sendHttpRequest(url, (statusCode, headers, body) => {
    logResponse(statusCode, headers, body, 'page_view');

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
    'properties': data.customBehavioralEventParameters ? makeTableMap(data.customBehavioralEventParameters, 'property', 'value') : {},
  };

  if (data.customBehavioralEventUtk) bodyData.utk = data.customBehavioralEventUtk;
  if (data.email) bodyData.email = data.email;
  if (data.customBehavioralEventObjectId) bodyData.objectId = data.customBehavioralEventObjectId;
  if (data.customBehavioralEventOccurredAt) bodyData.occurredAt = data.customBehavioralEventOccurredAt;

  logRequest(data.customBehavioralEventEventName, 'POST', url, bodyData);

  sendHttpRequest(url, (statusCode, headers, body) => {
    logResponse(statusCode, headers, body, data.customBehavioralEventEventName);

    if (statusCode >= 200 && statusCode < 300) {
      data.gtmOnSuccess();
    } else {
      data.gtmOnFailure();
    }
  }, {headers: getRequestHeaders(), method: 'POST'}, JSON.stringify(bodyData));
}

function createOrUpdateContactEvent() {
  let url = 'https://api.hubapi.com/contacts/v1/contact/createOrUpdate/email/'+encodeUriComponent(data.email)+'/';
  let bodyData = {
    'properties': data.contactParameters
  };

  logRequest('contact_create_or_update', 'POST', url, bodyData);

  sendHttpRequest(url, (statusCode, headers, body) => {
    logResponse(statusCode, headers, body, 'contact_create_or_update');

    if (statusCode >= 200 && statusCode < 300) {
      data.gtmOnSuccess();
    } else {
      data.gtmOnFailure();
    }
  }, {headers: getRequestHeaders(), method: 'POST'}, JSON.stringify(bodyData));
}

function ecommerceEvent() {
  let contactId, dealId;

  if (data.email) {
    contactId = createOrUpdateContact();
  }

  if (data.dealExternalId) {
    dealId = createOrUpdateDeal();
  };

  if (dealId && contactId) {
    associateDealToContact(dealId, contactId);
  }
}

function createDealLineItems(dealId, products) {
  let currentLineItems = getCurrentLineItems(dealId);

  for (let i = 0; i < products.length; i++) {
    let lineItemNotExists = true;

    if (currentLineItems.length > 0) {
      for (let l = 0; l < currentLineItems.length; l++) {
        if (currentLineItems[l].properties.hs_product_id == products[i].id) {
          lineItemNotExists = false;
        }
      }
    }

    if (lineItemNotExists) {
      let lineItem = products[i];

      lineItem.product_id = products[i].id;
      lineItem.hs_product_id = products[i].id;
      lineItem.deal_id = dealId;
      lineItem.hs_deal_id = dealId;
      lineItem.discount_amount = products[i].discount_amount ? products[i].discount_amount : '';
      lineItem.num_items = products[i].quantity;
      lineItem.tax_amount = products[i].tax;

      let lineItemId = sendEcommerceRequest('line_item_create', 'POST', 'https://api.hubapi.com/crm/v3/objects/line_items', lineItem);
      associateDealToLineItem(dealId, lineItemId);
    }
  }
}

function removeDealLineItems(dealId, products) {
  let currentLineItems = getCurrentLineItems(dealId);

  for (let i = 0; i < products.length; i++) {
    if (currentLineItems.length > 0) {
      for (let l = 0; l < currentLineItems.length; l++) {
        if (currentLineItems[l].properties.hs_product_id == products[i].id) {
          sendEcommerceRequest('line_item_delete', 'DELETE', '/crm/v3/objects/line_items/'+currentLineItems[l].id, {});
        }
      }
    }
  }
}

function associateDealToContact(dealId, contactId) {
  let url = 'https://api.hubapi.com/crm/v3/objects/deals/'+dealId+'/associations/contact/'+contactId+'/deal_to_contact';

  return sendEcommerceRequest('deal_to_contact_association', 'PUT', url, {});
}

function associateDealToLineItem(dealId, lineItemId) {
  let url = 'https://api.hubapi.com/crm/v3/objects/deals/'+dealId+'/associations/line_items/'+lineItemId+'/deal_to_line_item';

  return sendEcommerceRequest('deal_to_line_item_association', 'PUT', url, {});
}

function getCurrentLineItems(dealId) {
  let url = 'https://api.hubapi.com/crm/v3/objects/deals/'+dealId+'/associations/line_items';

  logRequest('get_current_line_item_ids', 'GET', url, {});

  return sendHttpRequest(url, {
    headers: getRequestHeaders(),
    method: 'GET',
  }, {}).then((result) => {
    logResponse(result.statusCode, result.headers, result.body, 'get_current_line_item_ids');

    if (result.statusCode >= 200 && result.statusCode < 300) {
      let currentLineItemsIds = JSON.parse(result.body).results;

      if (currentLineItemsIds.length > 0) {
        let bodyData = {'inputs': currentLineItemsIds};
        url = 'https://api.hubapi.com/crm/v3/objects/line_items/batch/read';

        logRequest('get_current_line_items', 'POST', url, bodyData);

        return sendHttpRequest(url, {
          headers: getRequestHeaders(),
          method: 'POST',
        }, JSON.stringify(bodyData)).then((result) => {
          logResponse(result.statusCode, result.headers, result.body, 'get_current_line_items');

          if (result.statusCode >= 200 && result.statusCode < 300) {
            return JSON.parse(result.body).results;
          } else {
            data.gtmOnFailure();
          }
        });
      }

      return [];
    } else {
      data.gtmOnFailure();
    }
  });
}

function createOrUpdateDeal() {
  let url = 'https://api.hubapi.com/crm/v3/objects/deals/search';
  let bodyData = {
    'filterGroups': [
      {
        'filters': [
          {
            'value': data.dealExternalId,
            'propertyName': 'dealname',
            'operator': 'EQ'
          }
        ]
      }
    ]
  };

  logRequest('deal_search', 'POST', url, bodyData);

  return sendHttpRequest(url, {
    headers: getRequestHeaders(),
    method: 'POST',
  }, JSON.stringify(bodyData)).then((result) => {
    logResponse(result.statusCode, result.headers, result.body, 'deal_search');

    if (result.statusCode >= 200 && result.statusCode < 300) {
      let dealId;
      let parsedBody = JSON.parse(result.body);
      let dealData = {
        'properties': data.dealParameters ? makeTableMap(data.dealParameters, 'property', 'value') : {}
      };

      dealData.properties.dealExternalId = data.dealExternalId;
      dealData.properties.order_number = data.dealExternalId;
      dealData.properties.dealname = data.dealExternalId;
      dealData.properties.name = data.dealExternalId;

      if (data.dealAmount) dealData.properties.amount = data.dealAmount;
      if (data.dealTax) dealData.properties.tax_price = data.dealTax;

      if (makeInteger(parsedBody.total) > 0) {
        dealId = sendEcommerceRequest('deal_update', 'PATCH', 'https://api.hubapi.com/crm/v3/objects/deals/'+parsedBody.results[0].id, dealData);
      } else {
        dealId = sendEcommerceRequest('deal_create', 'POST', 'https://api.hubapi.com/crm/v3/objects/deals', dealData);
      }

      if (data.dealProducts && data.dealProducts.length > 0) {
        if (data.ecommerceEventType === 'removeFromCart') {
          removeDealLineItems(dealId, data.dealProducts);
        } else {
          createDealLineItems(dealId, data.dealProducts);
        }
      }

      return dealId;
    } else {
      data.gtmOnFailure();
    }
  });
}

function createOrUpdateContact() {
  let url = 'https://api.hubapi.com/crm/v3/objects/contacts/search';
  let bodyData = {
    'filterGroups': [
      {
        'filters': [
          {
            'value': data.email,
            'propertyName': 'email',
            'operator': 'EQ'
          }
        ]
      }
    ]
  };

  logRequest('contact_search', 'POST', url, bodyData);

  return sendHttpRequest(url, {
    headers: getRequestHeaders(),
    method: 'POST',
  }, JSON.stringify(bodyData)).then((result) => {
    logResponse(result.statusCode, result.headers, result.body, 'contact_search');

    if (result.statusCode >= 200 && result.statusCode < 300) {
      let parsedBody = JSON.parse(result.body);
      let contactData = {
        'properties': data.contactParameters ? makeTableMap(data.contactParameters, 'property', 'value') : {}
      };

      if (data.email) contactData.properties.email = data.email;
      if (data.contactFirstName) contactData.properties.firstname = data.contactFirstName;
      if (data.contactLastName) contactData.properties.lastname = data.contactLastName;
      if (data.contactPhone) contactData.properties.mobile_phone = data.contactPhone;

      if (makeInteger(parsedBody.total) > 0) {
        let contactID = parsedBody.results[0].id;

        return sendEcommerceRequest('contact_update', 'PATCH', 'https://api.hubapi.com/crm/v3/objects/contacts/'+contactID, contactData);
      }

      return sendEcommerceRequest('contact_create', 'POST', 'https://api.hubapi.com/crm/v3/objects/contacts', contactData);
    } else {
      data.gtmOnFailure();
    }
  });
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

function logResponse(statusCode, headers, body, eventName) {
  if (isLoggingEnabled) {
    logToConsole(JSON.stringify({
      'Name': 'HubSpot',
      'Type': 'Response',
      'TraceId': traceId,
      'EventName': eventName,
      'ResponseStatusCode': statusCode,
      'ResponseHeaders': headers,
      'ResponseBody': body,
    }));
  }
}

function logRequest(eventName, method, url, bodyData) {
  if (isLoggingEnabled) {
    logToConsole(JSON.stringify({
      'Name': 'HubSpot',
      'Type': 'Request',
      'TraceId': traceId,
      'EventName': eventName,
      'RequestMethod': method,
      'RequestUrl': url,
      'RequestBody': bodyData,
    }));
  }
}

function getRequestHeaders() {
  return {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + data.apiKey};
}

function sendEcommerceRequest(eventName, method, url, bodyData) {
  logRequest(eventName, method, url, bodyData);

  return sendHttpRequest(url, {
    headers: getRequestHeaders(),
    method: method,
  }, JSON.stringify(bodyData)).then((result) => {
    logResponse(result.statusCode, result.headers, result.body, eventName);

    if (result.statusCode >= 200 && result.statusCode < 300) {
      return JSON.parse(result.body).id;
    } else {
      data.gtmOnFailure();
    }
  });
}
