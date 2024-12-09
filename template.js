const sendHttpRequest = require('sendHttpRequest');
const JSON = require('JSON');
const getRequestHeader = require('getRequestHeader');
const makeTableMap = require('makeTableMap');
const makeInteger = require('makeInteger');
const makeNumber = require('makeNumber');
const Promise = require('Promise');
const getAllEventData = require('getAllEventData');
const encodeUriComponent = require('encodeUriComponent');

const logToConsole = require('logToConsole');
const getContainerVersion = require('getContainerVersion');
const isLoggingEnabled = determinateIsLoggingEnabled();
const traceId = getRequestHeader('trace-id');
const eventData = getAllEventData();

let type = data.type;

if (type === 'trackEventPageView') {
  trackPageViewEvent();
} else if (type === 'trackCustomBehavioralEvent') {
  trackCustomBehavioralEvent();
} else if (type === 'createOrUpdateContact') {
  createOrUpdateContact().then(() => {
    data.gtmOnSuccess();
  });
} else if (type === 'ecommerce') {
  ecommerceEvent();
} else if (type === 'createOrUpdateObject') {
  createOrUpdateCustomObject();
} else {
  data.gtmOnFailure();
}

function trackPageViewEvent() {
  let url =
    'https://track.hubspot.com/__ptq.gif?k=1&v=1.1&ct=' +
    encodeUriComponent('standard-page');
  const clientId = eventData.client_id;
  if (data.accountId) url = url + '&a=' + encodeUriComponent(data.accountId);
  if (clientId) {
    url =
      url +
      '&vi=' +
      encodeUriComponent(clientId) +
      '&u=' +
      encodeUriComponent(clientId);
  }
  if (eventData.ga_session_id)
    url = url + '&b=' + encodeUriComponent(eventData.ga_session_id);
  if (eventData.page_referrer)
    url = url + '&r=' + encodeUriComponent(eventData.page_referrer);
  if (eventData.page_title)
    url = url + '&t=' + encodeUriComponent(eventData.page_title);
  if (eventData.page_location)
    url = url + '&pu=' + encodeUriComponent(eventData.page_location);
  if (eventData.screen_resolution)
    url = url + '&sd=' + encodeUriComponent(eventData.screen_resolution);
  if (eventData.page_encoding)
    url = url + '&cs=' + encodeUriComponent(eventData.page_encoding);

  logRequest('page_view', 'GET', url, '');

  sendHttpRequest(
    url,
    (statusCode, headers, body) => {
      logResponse(statusCode, headers, body, 'page_view');

      if (statusCode >= 200 && statusCode < 300) {
        data.gtmOnSuccess();
      } else {
        data.gtmOnFailure();
      }
    },
    {
      headers: { 'User-Agent': eventData.user_agent },
      method: 'GET',
      timeout: 3500
    }
  );
}

function trackCustomBehavioralEvent() {
  let url = 'https://api.hubapi.com/events/v3/send';
  let bodyData = {
    eventName: data.customBehavioralEventEventName,
    properties: data.customBehavioralEventParameters
      ? makeTableMap(data.customBehavioralEventParameters, 'property', 'value')
      : {}
  };

  if (data.customBehavioralEventUtk)
    bodyData.utk = data.customBehavioralEventUtk;
  if (data.email) bodyData.email = data.email;
  if (data.customBehavioralEventObjectId)
    bodyData.objectId = data.customBehavioralEventObjectId;
  if (data.customBehavioralEventOccurredAt)
    bodyData.occurredAt = data.customBehavioralEventOccurredAt;

  logRequest(data.customBehavioralEventEventName, 'POST', url, bodyData);

  sendHttpRequest(
    url,
    (statusCode, headers, body) => {
      logResponse(
        statusCode,
        headers,
        body,
        data.customBehavioralEventEventName
      );

      if (statusCode >= 200 && statusCode < 300) {
        data.gtmOnSuccess();
      } else {
        data.gtmOnFailure();
      }
    },
    { headers: getRequestHeaders(), method: 'POST' },
    JSON.stringify(bodyData)
  );
}

function ecommerceEvent() {
  let contactId, dealId;

  if (data.email) {
    contactId = createOrUpdateContact();
  }

  if (data.dealExternalId) {
    dealId = createOrUpdateDeal();

    dealId.then(function (dealId) {
      if (data.dealProducts && data.dealProducts.length > 0) {
        if (data.ecommerceEventType === 'removeFromCart') {
          removeDealLineItems(dealId, data.dealProducts);
        } else {
          createDealLineItems(dealId, data.dealProducts);
        }
      }
    });
  }

  if (dealId && contactId) {
    Promise.all([dealId, contactId]).then((results) => {
      associateDealToContact(results[0], results[1]).then(() => {
        data.gtmOnSuccess();
      });
    });
  } else if (dealId) {
    dealId.then(() => {
      data.gtmOnSuccess();
    });
  } else if (contactId) {
    contactId.then(() => {
      data.gtmOnSuccess();
    });
  } else {
    data.gtmOnSuccess();
  }
}

function createDealLineItems(dealId, products) {
  getCurrentLineItems(dealId).then(function (currentLineItems) {
    for (let i = 0; i < products.length; i++) {
      let lineItemHsId = 0;
      let lineItemNotExists = true;

      if (currentLineItems.length > 0) {
        for (let l = 0; l < currentLineItems.length; l++) {
          if (currentLineItems[l].properties.hs_sku == products[i].id) {
            lineItemNotExists = false;
            lineItemHsId = currentLineItems[l].id;
          }
        }
      }

      let lineItem = products[i];

      if (products[i].quantity)
        lineItem.quantity = makeInteger(products[i].quantity);
      if (products[i].quantity)
        lineItem.num_items = makeInteger(products[i].quantity);
      if (products[i].quantity)
        lineItem.quantity_per_line = makeInteger(products[i].quantity);

      if (products[i].price) lineItem.price = makeNumber(products[i].price);
      if (products[i].price) lineItem.amount = makeNumber(products[i].price);

      if (products[i].discount_amount)
        lineItem.hs_total_discount = makeNumber(products[i].discount_amount);
      if (products[i].tax) lineItem.tax_amount = makeNumber(products[i].tax);

      if (lineItemNotExists) {
        sendEcommerceRequest(
          'product_get',
          'GET',
          'https://api.hubapi.com/crm/v3/objects/products/' +
            products[i].id +
            '?idProperty=hs_sku',
          ''
        ).then((productId) => {
          lineItem.sku = makeInteger(products[i].id);
          lineItem.hs_sku = makeInteger(products[i].id);

          lineItem.product_id = productId;
          lineItem.hs_product_id = productId;

          sendEcommerceRequest(
            'line_item_create',
            'POST',
            'https://api.hubapi.com/crm/v3/objects/line_items',
            { properties: lineItem }
          ).then((lineItemId) => {
            associateDealToLineItem(dealId, lineItemId);
          });
        });
      } else {
        sendEcommerceRequest(
          'line_item_update',
          'PATCH',
          'https://api.hubapi.com/crm/v3/objects/line_items/' + lineItemHsId,
          { properties: lineItem }
        );
      }
    }
  });
}

function removeDealLineItems(dealId, products) {
  getCurrentLineItems(dealId).then(function (currentLineItems) {
    for (let i = 0; i < products.length; i++) {
      if (currentLineItems.length > 0) {
        for (let l = 0; l < currentLineItems.length; l++) {
          if (currentLineItems[l].properties.hs_sku == products[i].id) {
            sendEcommerceRequest(
              'line_item_delete',
              'DELETE',
              'https://api.hubapi.com/crm/v3/objects/line_items/' +
                currentLineItems[l].id,
              ''
            );
          }
        }
      }
    }
  });
}

function associateDealToContact(dealId, contactId) {
  let url =
    'https://api.hubapi.com/crm/v3/objects/deals/' +
    dealId +
    '/associations/contact/' +
    contactId +
    '/deal_to_contact';

  return sendEcommerceRequest('deal_to_contact_association', 'PUT', url, '');
}

function associateDealToLineItem(dealId, lineItemId) {
  let url =
    'https://api.hubapi.com/crm/v3/objects/deals/' +
    dealId +
    '/associations/line_items/' +
    lineItemId +
    '/deal_to_line_item';

  return sendEcommerceRequest('deal_to_line_item_association', 'PUT', url, '');
}

function getCurrentLineItems(dealId) {
  let url =
    'https://api.hubapi.com/crm/v3/objects/deals/' +
    dealId +
    '/associations/line_items';

  logRequest('get_current_line_item_ids', 'GET', url, '');

  return sendHttpRequest(
    url,
    {
      headers: getRequestHeaders(),
      method: 'GET'
    },
    ''
  ).then((result) => {
    logResponse(
      result.statusCode,
      result.headers,
      result.body,
      'get_current_line_item_ids'
    );

    if (result.statusCode >= 200 && result.statusCode < 300) {
      let currentLineItemsIds = JSON.parse(result.body).results;

      if (currentLineItemsIds.length > 0) {
        let bodyData = {
          inputs: currentLineItemsIds,
          properties: ['hs_product_id', 'hs_sku']
        };
        url = 'https://api.hubapi.com/crm/v3/objects/line_items/batch/read';

        logRequest('get_current_line_items', 'POST', url, bodyData);

        return sendHttpRequest(
          url,
          {
            headers: getRequestHeaders(),
            method: 'POST'
          },
          JSON.stringify(bodyData)
        ).then((result) => {
          logResponse(
            result.statusCode,
            result.headers,
            result.body,
            'get_current_line_items'
          );

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
    filterGroups: [
      {
        filters: [
          {
            value: data.dealExternalId,
            propertyName: 'dealname',
            operator: 'EQ'
          }
        ]
      }
    ]
  };

  logRequest('deal_search', 'POST', url, bodyData);

  return sendHttpRequest(
    url,
    {
      headers: getRequestHeaders(),
      method: 'POST'
    },
    JSON.stringify(bodyData)
  ).then((result) => {
    logResponse(result.statusCode, result.headers, result.body, 'deal_search');

    if (result.statusCode >= 200 && result.statusCode < 300) {
      let dealId;
      let parsedBody = JSON.parse(result.body);
      let dealData = {
        properties: data.dealParameters
          ? makeTableMap(data.dealParameters, 'property', 'value')
          : {}
      };

      dealData.properties.dealname = data.dealExternalId;
      if (data.dealAmount) dealData.properties.amount = data.dealAmount;

      if (makeInteger(parsedBody.total) > 0) {
        dealId = sendEcommerceRequest(
          'deal_update',
          'PATCH',
          'https://api.hubapi.com/crm/v3/objects/deals/' +
            parsedBody.results[0].id,
          dealData
        );
      } else {
        dealId = sendEcommerceRequest(
          'deal_create',
          'POST',
          'https://api.hubapi.com/crm/v3/objects/deals',
          dealData
        );
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
    filterGroups: [
      {
        filters: [
          {
            value: data.email,
            propertyName: 'email',
            operator: 'EQ'
          }
        ]
      }
    ]
  };

  logRequest('contact_search', 'POST', url, bodyData);

  return sendHttpRequest(
    url,
    {
      headers: getRequestHeaders(),
      method: 'POST'
    },
    JSON.stringify(bodyData)
  ).then((result) => {
    logResponse(
      result.statusCode,
      result.headers,
      result.body,
      'contact_search'
    );

    if (result.statusCode >= 200 && result.statusCode < 300) {
      let parsedBody = JSON.parse(result.body);
      let contactData = {
        properties: data.contactParameters
          ? makeTableMap(data.contactParameters, 'property', 'value')
          : {}
      };

      if (data.email) contactData.properties.email = data.email;
      if (data.contactFirstName)
        contactData.properties.firstname = data.contactFirstName;
      if (data.contactLastName)
        contactData.properties.lastname = data.contactLastName;
      if (data.contactPhone)
        contactData.properties.mobilephone = data.contactPhone;

      if (makeInteger(parsedBody.total) > 0) {
        let contactID = parsedBody.results[0].id;

        return sendEcommerceRequest(
          'contact_update',
          'PATCH',
          'https://api.hubapi.com/crm/v3/objects/contacts/' + contactID,
          contactData
        );
      }

      return sendEcommerceRequest(
        'contact_create',
        'POST',
        'https://api.hubapi.com/crm/v3/objects/contacts',
        contactData
      );
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
    logToConsole(
      JSON.stringify({
        Name: 'HubSpot',
        Type: 'Response',
        TraceId: traceId,
        EventName: eventName,
        ResponseStatusCode: statusCode,
        ResponseHeaders: headers,
        ResponseBody: body
      })
    );
  }
}

function logRequest(eventName, method, url, bodyData) {
  if (isLoggingEnabled) {
    logToConsole(
      JSON.stringify({
        Name: 'HubSpot',
        Type: 'Request',
        TraceId: traceId,
        EventName: eventName,
        RequestMethod: method,
        RequestUrl: url,
        RequestBody: bodyData
      })
    );
  }
}

function getRequestHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + data.apiKey
  };
}

function sendEcommerceRequest(eventName, method, url, bodyData) {
  logRequest(eventName, method, url, bodyData);

  return sendHttpRequest(
    url,
    {
      headers: getRequestHeaders(),
      method: method
    },
    JSON.stringify(bodyData)
  ).then((result) => {
    logResponse(result.statusCode, result.headers, result.body, eventName);

    if (result.statusCode === 204) {
      return true;
    } else if (result.statusCode >= 200 && result.statusCode < 300) {
      return JSON.parse(result.body).id;
    } else {
      data.gtmOnFailure();
    }
  });
}

function createOrUpdateCustomObject() {
  const url = 'https://api.hubapi.com/crm/v3/objects/' + data.customObjectId;

  const customObjectParameters = data.customObjectParameters;
  let bodyData = {
    properties: {}
  };
  for (let i in customObjectParameters) {
    bodyData.properties[customObjectParameters[i].key] =
      customObjectParameters[i].value;
  }

  logRequest('createCustomObject', 'POST', url, bodyData);

  sendHttpRequest(
    url,
    (statusCode, headers, body) => {
      logResponse(statusCode, headers, body, 'createCustomObject');

      if (statusCode >= 200 && statusCode < 300) {
        const responseData = JSON.parse(body);
        const customObjectId = responseData.id;

        createOrUpdateContact()
          .then((contactId) => {
            associateCustomObjectWithContact(customObjectId, contactId);
          })
          .catch((error) => {
            data.gtmOnFailure();
          });
      } else {
        data.gtmOnFailure();
      }
    },
    { headers: getRequestHeaders(), method: 'POST' },
    JSON.stringify(bodyData)
  );
}

function associateCustomObjectWithContact(customObjectId, contactId) {
  const url =
    'https://api.hubapi.com/crm/v3/objects/' +
    encodeUriComponent(data.customObjectId) +
    '/' +
    encodeUriComponent(customObjectId) +
    '/associations/contacts/' +
    encodeUriComponent(contactId) +
    '/';

  logRequest('associateCustomObjectWithContact', 'PUT', url, '');

  // Send the association request
  sendHttpRequest(
    url,
    (statusCode, headers, body) => {
      logResponse(
        statusCode,
        headers,
        body,
        'associateCustomObjectWithContact'
      );

      if (statusCode >= 200 && statusCode < 300) {
        data.gtmOnSuccess();
      } else {
        data.gtmOnFailure();
      }
    },
    { headers: getRequestHeaders(), method: 'PUT' }
  );
}
