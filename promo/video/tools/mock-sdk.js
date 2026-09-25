// Мок SDK Яндекс Игр для записи промо-видео: гость, каталог из двух товаров, без рекламы.
(function () {
  var q = new URLSearchParams(location.search);
  var lang = q.get("lang") || "ru";
  var yanSvg =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#fc3f1d"/><text x="12" y="16.5" font-size="12" font-family="Arial" font-weight="700" text-anchor="middle" fill="#fff">Я</text></svg>'
    );
  function product(id, title, description, price) {
    return {
      id: id,
      title: title,
      description: description,
      imageURI: "",
      price: price + " YAN",
      priceValue: String(price),
      priceCurrencyCode: "YAN",
      getPriceCurrencyImage: function () {
        return yanSvg;
      },
    };
  }
  var payments = {
    getCatalog: function () {
      return Promise.resolve([
        product("cash_pile", "Горсть наличных", "Мгновенно пополняет баланс", 19),
        product("vip_dealer", "Перекуп года", "+25% к доходу навсегда", 99),
      ]);
    },
    getPurchases: function () {
      return Promise.resolve([]);
    },
    purchase: function () {
      return Promise.reject(new Error("mock"));
    },
    consumePurchase: function () {
      return Promise.resolve();
    },
  };
  var player = {
    getUniqueID: function () {
      return "video-guest";
    },
    getName: function () {
      return "";
    },
    isAuthorized: function () {
      return false;
    },
    setData: function () {
      return Promise.resolve();
    },
    getData: function () {
      return Promise.resolve({});
    },
  };
  var ysdk = {
    environment: { i18n: { lang: lang, tld: "ru" } },
    features: {
      LoadingAPI: { ready: function () {} },
      GameplayAPI: { start: function () {}, stop: function () {} },
    },
    EVENTS: {
      HISTORY_BACK: "HISTORY_BACK",
      EXIT: "EXIT",
      ACCOUNT_SELECTION_DIALOG_OPENED: "ACCOUNT_SELECTION_DIALOG_OPENED",
      ACCOUNT_SELECTION_DIALOG_CLOSED: "ACCOUNT_SELECTION_DIALOG_CLOSED",
    },
    getStorage: function () {
      return Promise.resolve(window.localStorage);
    },
    getPlayer: function () {
      return Promise.resolve(player);
    },
    getPayments: function () {
      return Promise.resolve(payments);
    },
    payments: payments,
    on: function () {},
    off: function () {},
    dispatchEvent: function () {
      return Promise.resolve();
    },
    isAvailableMethod: function () {
      return Promise.resolve(true);
    },
    auth: {
      openAuthDialog: function () {
        return Promise.reject(new Error("mock"));
      },
    },
    adv: {
      showFullscreenAdv: function (o) {
        var cb = (o && o.callbacks) || {};
        cb.onClose && cb.onClose(false);
      },
      showRewardedVideo: function (o) {
        var cb = (o && o.callbacks) || {};
        cb.onError && cb.onError(new Error("mock"));
      },
    },
  };
  window.YaGames = {
    init: function () {
      return Promise.resolve(ysdk);
    },
  };
})();
