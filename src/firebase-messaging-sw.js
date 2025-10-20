importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyD1JSxGL8iAGSjQL84iBIsTM_Cmo9Bx3kA",
  authDomain: "lu-mirsinn.firebaseapp.com",
  projectId: "lu-mirsinn",
  storageBucket: "lu-mirsinn.firebasestorage.app",
  messagingSenderId: "102516593827",
  appId: "1:102516593827:web:3c12cf92ebf18fae3cdb16",
};

firebase.initializeApp(firebaseConfig);
firebase.messaging();

const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
    icon: '/assets/icon/mir-sinn-icon-192.png',
  });
});