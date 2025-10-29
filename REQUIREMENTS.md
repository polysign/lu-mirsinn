# Mir Sinn Letzebuerg

**Mir Sinn** is a small mobile first web application which simply asks a single question every day to its active users. Each question can be answered within a couple of seconds. Once answered, the questionnaire is closed and the user cannot edit/reply anymore.

The day after, the users can look at the results, which will be extended by AI generated content and analysis.

## Features

- One question per day, nothing else
- When answered, the user can look at past questions and their results
- Share App with friends over social networks (native sharing feature)

## UI

The UI is a homage to Luxembourg. So the flags colours must be used throughout the app in a smart way. It should not look too bold. The colours must, if used, used in the right combination, as the flag is ROUD, WAISS, BLO.

```css
:root {
  --lux-red: #ED2939;
  --lux-white: #FFFFFF;
  --lux-blue: #00A1DE;
}
```

## Database

The database is a Firestore database. So Firebase/Firestore is used to store questions, and answers.

### Devices

A devices collection is used to store information about the device which connects to the app. The app is totally free and open, so there should also not be any private information stored inside the database. A device ID should be stored so we can retrieve and identify the device.

Use the following code as a base to implement device ID generation and storage. The device ID is also synced to Firestore inside the 'devices/{deviceID}' collection.

```js
async function getDeviceId() {
  const gen = () =>
    ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );

  // Try IndexedDB for better durability
  const idb = await (async () => {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open('app-store', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('kv');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
  })().catch(() => null);

  const readIdb = async () => new Promise(res => {
    const tx = idb.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').get('mir-sinn-device-id');
    req.onsuccess = () => res(req.result || null);
    req.onerror = () => res(null);
  });

  const writeIdb = async (v) => new Promise(res => {
    const tx = idb.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(v, 'mir-sinn-device-id');
    tx.oncomplete = () => res();
    tx.onerror = () => res();
  });

  let did = null;
  if (idb) did = await readIdb();

  if (!did) {
    // fallback: localStorage
    did = localStorage.getItem('mir-sinn-device-id');
  }

  if (!did) {
    did = gen();
    try { localStorage.setItem('mir-sinn-device-id', did); } catch {}
    if (idb) { try { await writeIdb(did); } catch {} }
  }

  return did;
}

(async () => {
  const deviceId = await getDeviceId();
  // Attach to your requests
  window.__DEVICE_ID__ = deviceId;
})();
```

### Questions

Questions are generated at midnight by a Firebase function. The function should browse to https://www.rtl.lu/news/national and download the HTML code. Then send it to OpenAI via API to analyse the content using the following prompt:

```prompt
Read the HTML file and extract all articles. Thee news articles have comments. Check which article has the most comments and extract the link to the article. Open the articles link and read the entire article. Create a short resumé of the article. Use the resumé to generate a single Question for our users, how they think about this topic. This can be a simple 2-4 way option to answer the question. Like YES/NO, or Absolutely/Yes/No/Definitely not, or similar.
```

The answer is then stored in a questions collection. The document's path will be 'questions/{mm-dd-yyyy}'. The document includes the question in 4 different languages, luxembourgish, french, german, and english. As well the possible answers are translated in these languages.

### Answers

The user can select his answer from a dropdown input and then press the "SUBMIT" button to send and save his answer. The answer is stored inside a subcollection of the question. The path will be 'questions/{mm-dd-yyyy}/answers/{deviceId}'. It uses the device ID in order to not answer multiple times.

### Results

Each question will have a results object inside the document, which will have all the results in various formats, based on the answers given.

For example, the total number of votes/answers, the percentage and number of answers is stored inside the question document.
