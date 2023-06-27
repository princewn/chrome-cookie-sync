"use strict";
var localCacheList = {}; 
var localRefreshList = {}; 


addCookiesChangeEvent();

function addCookiesChangeEvent() {
  console.log("addCookiesChangeEvent");
  chrome.cookies.onChanged.addListener(async ({ cookie, removed }) => {
    const { domainList: domainObj } = await chrome.storage.local.get(["domainList"]);
    const storageList = domainObj? Object.keys(domainObj).map(key => domainObj[key]) : [];
    const target = storageList.find(
      e => (equalDomain(e.from, cookie.domain) || includedDomain(e.from, cookie.domain)) && e.name === cookie.name && e.inUse === true
    );
    console.log("target", target);
    if (target) {
      // 移除
      if (removed) removeCookie(cookie, target);
      // 设置、更新
      else setCookie(cookie, target);
    }
  });
}

function setCookie(cookie, config) {
  if(config.to.indexOf('localhost') > -1 || config.to.indexOf('127.0.0.1') > -1 || config.to.indexOf('127.0.0.1') > -1) {
    chrome.cookies.set({
      url: addProtocol(config.to),
      domain: "",
      name: cookie["name"],
      path: cookie["path"],
      value: cookie["value"],
    });
    return
  }
  chrome.cookies.set({
    url: addProtocol(config.to),
    domain: removeProtocol(config.to),
    name: cookie["name"],
    path: cookie["path"],
    value: cookie["value"],
  });
}

function removeCookie(cookie, config) {
  chrome.cookies.remove({
    url: addProtocol(config.to),
    name: cookie["name"],
  });
}

function addProtocol(uri) {
  return uri.startsWith("http") || uri.startsWith("https") ? uri : "https://" + uri;
}

function removeProtocol(uri) {
  return uri.startsWith("http") || uri.startsWith("https") ? uri.replace("https://", "").replace("http://", "") : uri;
}

function equalDomain(domain1, domain2) {
  return addProtocol(domain1) === addProtocol(domain2);
}

function includedDomain(domain1, domain2) {
  return removeProtocol(domain1).indexOf(removeProtocol(domain2)) > -1;
}

function loadData() {
  chrome.storage.local.get('SavedRefreshList', function (items) {
    localCacheList = items;
    console.log("Loading SavedRefreshList", localCacheList);
  });
}

function saveData() {
  console.log("Saving SavedRefreshList", localCacheList);
  chrome.storage.local.set({
    'SavedRefreshList': localCacheList,
  });
}

function startRefreshingTab(duration, targetTab, url) {
  var timer = duration;
  const interval = setInterval(() => {
    console.log("time before refresh: ", timer, " ", url);
    if (!localRefreshList[url].isSessionActive) {
      console.log("session not active, clearing interval");
      localRefreshList[url].interval = null;
      clearInterval(interval);
    }
    localRefreshList[url].currentTime = timer;
    if (--timer < 0) {
      timer = duration;
      console.log("restarting targetTab ", targetTab);
      chrome.tabs
        .reload(targetTab.id, { bypassCache: false }, (e) => {
          chrome.windows.getAll({ populate: true }, (windows) => {
            var tabExist = false
            for (var i = 0, window; window = windows[i]; i++) {
              for (var j = 0, tab; tab = window.tabs[j]; j++) {
                if (tab.id == targetTab.id) {
                  tabExist = true
                }
              }
            }
            if (tabExist === false) {
              console.log("tab does not exist");
              localRefreshList[url] = {
                currentTime: duration,
                isSessionActive: false,
                interval: null,
              };
              clearInterval(interval);
            }
          });
          console.log("Reload finih, no errors");
        })
    }
  }, 1000);
  localRefreshList[url].interval = interval;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === "add_url") {
    chrome.storage.local.set(
      {
        [request.payload.url]: request.payload.time,
      },
      () => {
        if (chrome.runtime.lastError) {
          sendResponse({ message: "fail" });
          return;
        }
        localCacheList[request.payload.url] = request.payload.time;
        
        if (
          localRefreshList[request.payload.url] &&
          localRefreshList[request.payload.url].interval
        ) {
          clearInterval(localRefreshList[request.payload.url].interval);
        }
        localRefreshList[request.payload.url] = {
          currentTime: request.payload.time,
          tab: request.payload.tab,
          isSessionActive: true,
        };
        saveData()
        startRefreshingTab(
          request.payload.time,
          request.payload.tab,
          request.payload.url
        );
        sendResponse({ message: "success" });
      }
    );
    return true;
  } else if (request.message === "get_refresh_time") {
    console.log('getting refreshing time', localCacheList)
    if (localCacheList[request.payload.url]) {
      console.log("sending back payload");
      sendResponse({
        message: "success",
        payload: localCacheList[request.payload.url],
      });
    } else {
      sendResponse({
        message: "fail",
      });
    }
  }
  else if (request.message === "stop_all_processes") {
    console.log("Removing all refresh activity")
    for (var key in localRefreshList) {
        localRefreshList[key].isSessionActive = false;
    }
    sendResponse({
      message: "success",
      payload: localCacheList[request.payload.url],
    });
  }
  else if (request.message === "stop_single_process") {
    // TODO: we should change this to remove by tabID
    console.log("removing url", request.payload.url, "  ", localRefreshList[request.payload.url])
    console.log("removing url2", request.payload.tab)
    //Remove URL from list to refresh
    for (var eye in localRefreshList) {
      console.log("removing url3",request.payload.tab.id, localRefreshList[eye].tab.id)
      if (request.payload.tab.id == localRefreshList[eye].tab.id ) {
        console.log("removing -> " + localRefreshList[eye]);
        localRefreshList[eye].isSessionActive = false;
        sendResponse({
          message: "success",
          payload: localCacheList[request.payload.url],
        });
        initStopIcon();
      }
    }
    sendResponse({
      message: "fail",
    });
  } else if (request.message === "get_tab_info") {
    //Check if current URL's time left before refresh, poor naming here
    console.log(
      "Getting Info based on URL",
      request.payload.url,
      request.payload.tab,
      localRefreshList[request.payload.url]
    );
    console.log ("request.payload.tab: ", request.payload.tab)
    console.log ("localRefreshList: ", localRefreshList)
    for (var key0 in localRefreshList) {
      if (request.payload.tab.id == localRefreshList[key0].tab.id ) {
        console.log("found matching tab info -> " + localRefreshList[key0]);
        sendResponse({
          message: "success",
          payload: localRefreshList[key0],
        });
      }
    }
    sendResponse({
      message: "fail",
    });
  }
});