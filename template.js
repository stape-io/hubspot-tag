const encodeUriComponent = require('encodeUriComponent');
const getAllEventData = require('getAllEventData');
const getCookieValues = require('getCookieValues');
const getRequestHeader = require('getRequestHeader');
const getTimestampMillis = require('getTimestampMillis');
const JSON = require('JSON');
const makeInteger = require('makeInteger');
const makeNumber = require('makeNumber');
const makeTableMap = require('makeTableMap');
const Promise = require('Promise');
const sendHttpRequest = require('sendHttpRequest');
const setCookie = require('setCookie');
const sha256Sync = require('sha256Sync');
const templateDataStorage = require('templateDataStorage');

/*==============================================================================
==============================================================================*/

const eventData = getAllEventData();

if (!isConsentGivenOrNotRequired()) {
  return data.gtmOnSuccess();
}

const url = eventData.page_location || getRequestHeader('referer');
if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) {
  return data.gtmOnSuccess();
}

const actionHandlers = {
  trackEventPageView: trackPageViewEvent,
  trackCustomBehavioralEvent: trackCustomBehavioralEvent,
  createOrUpdateContact: () => {
    createOrUpdateContact().then(() => {
      data.gtmOnSuccess();
    });
  },
  ecommerce: ecommerceEvent,
  createOrUpdateObject: createOrUpdateCustomObject,
  identifyVisitor: identifyVisitorEvent
};

const handler = actionHandlers[data.type];
if (handler) {
  handler();
} else {
  data.gtmOnFailure();
}

/*==============================================================================
Vendor related functions
==============================================================================*/

function trackPageViewEvent() {
  let url =
    'https://track.hubspot.com/__ptq.gif?k=1&v=1.1&ct=' + encodeUriComponent('standard-page');
  const clientId = eventData.client_id;
  if (data.accountId) url = url + '&a=' + encodeUriComponent(data.accountId);
  if (clientId) {
    url = url + '&vi=' + encodeUriComponent(clientId) + '&u=' + encodeUriComponent(clientId);
  }
  if (eventData.ga_session_id) url = url + '&b=' + encodeUriComponent(eventData.ga_session_id);
  if (eventData.page_referrer) url = url + '&r=' + encodeUriComponent(eventData.page_referrer);
  if (eventData.page_title) url = url + '&t=' + encodeUriComponent(eventData.page_title);
  if (eventData.page_location) url = url + '&pu=' + encodeUriComponent(eventData.page_location);
  if (eventData.screen_resolution)
    url = url + '&sd=' + encodeUriComponent(eventData.screen_resolution);
  if (eventData.page_encoding) url = url + '&cs=' + encodeUriComponent(eventData.page_encoding);

  sendHttpRequest(
    url,
    (statusCode, headers, body) => {
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
  const url = 'https://api.hubapi.com/events/v3/send';
  const bodyData = {
    eventName: data.customBehavioralEventEventName,
    properties: data.customBehavioralEventParameters
      ? makeTableMap(data.customBehavioralEventParameters, 'property', 'value')
      : {}
  };

  if (data.customBehavioralEventUtk) bodyData.utk = data.customBehavioralEventUtk;
  if (data.email) bodyData.email = data.email;
  if (data.customBehavioralEventObjectId) bodyData.objectId = data.customBehavioralEventObjectId;
  if (data.customBehavioralEventOccurredAt)
    bodyData.occurredAt = data.customBehavioralEventOccurredAt;

  sendHttpRequest(
    url,
    (statusCode, headers, body) => {
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

      const lineItem = products[i];

      if (products[i].quantity) lineItem.quantity = makeInteger(products[i].quantity);
      if (products[i].quantity) lineItem.num_items = makeInteger(products[i].quantity);
      if (products[i].quantity) lineItem.quantity_per_line = makeInteger(products[i].quantity);

      if (products[i].price) lineItem.price = makeNumber(products[i].price);
      if (products[i].price) lineItem.amount = makeNumber(products[i].price);

      if (products[i].discount_amount)
        lineItem.hs_total_discount = makeNumber(products[i].discount_amount);
      if (products[i].tax) lineItem.tax_amount = makeNumber(products[i].tax);

      if (lineItemNotExists) {
        sendEcommerceRequest(
          'product_get',
          'GET',
          'https://api.hubapi.com/crm/v3/objects/products/' + products[i].id + '?idProperty=hs_sku',
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
              'https://api.hubapi.com/crm/v3/objects/line_items/' + currentLineItems[l].id,
              ''
            );
          }
        }
      }
    }
  });
}

function associateDealToContact(dealId, contactId) {
  const url =
    'https://api.hubapi.com/crm/v3/objects/deals/' +
    dealId +
    '/associations/contact/' +
    contactId +
    '/deal_to_contact';

  return sendEcommerceRequest('deal_to_contact_association', 'PUT', url, '');
}

function associateDealToLineItem(dealId, lineItemId) {
  const url =
    'https://api.hubapi.com/crm/v3/objects/deals/' +
    dealId +
    '/associations/line_items/' +
    lineItemId +
    '/deal_to_line_item';

  return sendEcommerceRequest('deal_to_line_item_association', 'PUT', url, '');
}

function getCurrentLineItems(dealId) {
  const url = 'https://api.hubapi.com/crm/v3/objects/deals/' + dealId + '/associations/line_items';

  return sendHttpRequest(
    url,
    {
      headers: getRequestHeaders(),
      method: 'GET'
    },
    ''
  ).then((result) => {
    if (result.statusCode >= 200 && result.statusCode < 300) {
      const currentLineItemsIds = JSON.parse(result.body).results;

      if (currentLineItemsIds.length > 0) {
        const bodyData = {
          inputs: currentLineItemsIds,
          properties: ['hs_product_id', 'hs_sku']
        };
        const url = 'https://api.hubapi.com/crm/v3/objects/line_items/batch/read';

        return sendHttpRequest(
          url,
          {
            headers: getRequestHeaders(),
            method: 'POST'
          },
          JSON.stringify(bodyData)
        ).then((result) => {
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
  const url = 'https://api.hubapi.com/crm/v3/objects/deals/search';
  const bodyData = {
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

  return sendHttpRequest(
    url,
    {
      headers: getRequestHeaders(),
      method: 'POST'
    },
    JSON.stringify(bodyData)
  ).then((result) => {
    if (result.statusCode >= 200 && result.statusCode < 300) {
      let dealId;
      const parsedBody = JSON.parse(result.body);
      const dealData = {
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
          'https://api.hubapi.com/crm/v3/objects/deals/' + parsedBody.results[0].id,
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
  const url = 'https://api.hubapi.com/crm/v3/objects/contacts/search';
  const bodyData = {
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

  return sendHttpRequest(
    url,
    {
      headers: getRequestHeaders(),
      method: 'POST'
    },
    JSON.stringify(bodyData)
  ).then((result) => {
    if (result.statusCode >= 200 && result.statusCode < 300) {
      const parsedBody = JSON.parse(result.body);
      const contactData = {
        properties: data.contactParameters
          ? makeTableMap(data.contactParameters, 'property', 'value')
          : {}
      };

      if (data.email) contactData.properties.email = data.email;
      if (data.contactFirstName) contactData.properties.firstname = data.contactFirstName;
      if (data.contactLastName) contactData.properties.lastname = data.contactLastName;
      if (data.contactPhone) contactData.properties.mobilephone = data.contactPhone;

      if (makeInteger(parsedBody.total) > 0) {
        const contactID = parsedBody.results[0].id;

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

function sendEcommerceRequest(eventName, method, url, bodyData) {
  return sendHttpRequest(
    url,
    {
      headers: getRequestHeaders(),
      method: method
    },
    JSON.stringify(bodyData)
  ).then((result) => {
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
  const url =
    'https://api.hubapi.com/crm/v3/objects/' +
    // This is actually the Object Type ID (not the Object ID).
    data.customObjectId;

  const customObjectParameters = data.customObjectParameters;
  const bodyData = {
    properties: {}
  };
  for (let i in customObjectParameters) {
    bodyData.properties[customObjectParameters[i].key] = customObjectParameters[i].value;
  }

  sendHttpRequest(
    url,
    (statusCode, headers, body) => {
      if (statusCode >= 200 && statusCode < 300) {
        const responseData = JSON.parse(body);
        const customObjectId = responseData.id; // This is the Object ID.

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
    // This is actually the Object Type ID (not the Object ID).
    encodeUriComponent(data.customObjectId) +
    '/' +
    encodeUriComponent(customObjectId) + // This is the Object ID.
    '/associations/contacts/' +
    encodeUriComponent(contactId) +
    '/' +
    encodeUriComponent(data.customObjectAndContactAssociationTypeId);

  // Send the association request
  sendHttpRequest(
    url,
    (statusCode, headers, body) => {
      if (statusCode >= 200 && statusCode < 300) {
        data.gtmOnSuccess();
      } else {
        data.gtmOnFailure();
      }
    },
    { headers: getRequestHeaders(), method: 'PUT' }
  );
}

function identifyVisitorEvent() {
  // This endpoit also works, it's present in old docs.
  // 'https://api.hubapi.com/conversations/v3/visitor-identification/tokens/create'
  const url = 'https://api.hubapi.com/visitor-identification/v3/tokens/create';

  const bodyData = {
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email
  };

  const tokenFromCookie = getCookieValues('__hs_visitor_id_token')[0];
  const cacheKey = sha256Sync(url + JSON.stringify(bodyData));
  const tokenInfoFromCache = templateDataStorage.getItemCopy(cacheKey);
  const now = getTimestampMillis();
  if (
    tokenInfoFromCache &&
    tokenInfoFromCache.expiresAt > now &&
    tokenInfoFromCache.token === tokenFromCookie
  ) {
    data.gtmOnSuccess();
    return;
  }

  sendHttpRequest(
    url,
    (statusCode, headers, body) => {
      const parsedBody = JSON.parse(body || '{}');
      if (statusCode === 200 && parsedBody.token) {
        setCookie(
          '__hs_visitor_id_token',
          parsedBody.token,
          {
            domain: 'auto',
            samesite: 'Lax',
            path: '/',
            secure: true,
            httpOnly: false, // Must be accessible by JS
            'max-age': 60 * 60 * 11 // 11 hours (token is valid for 12 hours according to docs)
          },
          false
        );
        templateDataStorage.setItemCopy(cacheKey, {
          token: parsedBody.token,
          expiresAt: getTimestampMillis() + 60 * 60 * 11 * 1000 // 11 hour (token is valid for 12 hours according to docs)
        });
        data.gtmOnSuccess();
      } else {
        data.gtmOnFailure();
      }
    },
    { headers: getRequestHeaders(), method: 'POST' },
    JSON.stringify(bodyData)
  );
}

/*==============================================================================
  Helpers
==============================================================================*/

function getRequestHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + data.apiKey
  };
}

function isConsentGivenOrNotRequired() {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}
