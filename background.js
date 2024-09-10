let currentTask = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setPopup({popup: 'popup.html'});
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startVirtualTryOn') {
    chrome.storage.local.set({ 'currentProductImageUrl': request.productImageUrl }, function() {
      chrome.action.openPopup();
    });
  }
  if (request.action === 'performKwaiKolorsTryOn') {
    if (currentTask) {
      sendResponse({ success: false, error: 'A task is already in progress' });
    } else {
      currentTask = performKwaiKolorsTryOn(request.personImageUrl, request.productImageUrl, request.currentPageUrl)
        .then(result => {
          currentTask = null;
          chrome.runtime.sendMessage({ action: 'tryOnCompleted', success: true, result });
          return { success: true, result };
        })
        .catch(error => {
          currentTask = null;
          chrome.runtime.sendMessage({ action: 'tryOnCompleted', success: false, error: error.message });
          return { success: false, error: error.message };
        });
      sendResponse({ success: true, message: 'Task started' });
    }
    return true;
  }
  if (request.action === 'checkTaskStatus') {
    if (currentTask) {
      sendResponse({ inProgress: true });
    } else {
      sendResponse({ inProgress: false });
    }
    return true;
  }
  if (request.action === 'proxyImage') {
    fetch(request.url)
      .then(response => response.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => sendResponse({ dataUrl: reader.result });
        reader.readAsDataURL(blob);
      })
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  if (request.action === 'performReplicateTryOn') {
    performReplicateTryOn(request.personImageUrl, request.productImageUrl, request.category, request.replicateApiToken)
      .then(response => sendResponse({ success: true, predictionId: response.id }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (request.action === 'checkPredictionStatus') {
    checkPredictionStatus(request.predictionId)
      .then(response => sendResponse({ success: true, ...response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (request.action === 'sendNotification') {
    sendNotification(request.title, request.message);
    sendResponse({ success: true });
    return true;
  }
  if (request.action === 'tryOnCompleted') {
    if (request.success) {
      sendNotification('Virtual Try-On 완료', '새로운 이미지가 생성되었습니다!');
    } else {
      sendNotification('Virtual Try-On 실패', '이미지 생성 중 오류가 발생했습니다.');
    }
  }
});

function sendNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'logo.png',
    title: title,
    message: message
  });
}

async function performKwaiKolorsTryOn(personImageUrl, productImageUrl, currentPageUrl) {
  const sessionHash = generateRandomSessionHash();
  const uploadId = generateRandomUploadId();

  try {
    console.log('Uploading person image:', personImageUrl);
    const personImagePath = await uploadImage(personImageUrl, uploadId, 'person');
    console.log('Person image upload response:', personImagePath);

    console.log('Uploading product image:', productImageUrl);
    const productImagePath = await uploadImage(productImageUrl, uploadId, 'product');
    console.log('Product image upload response:', productImagePath);

    const tryOnResponse = await fetch('https://kwai-kolors-kolors-virtual-try-on.hf.space/queue/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': '*/*',
        'Origin': 'https://kwai-kolors-kolors-virtual-try-on.hf.space',
        'Referer': 'https://kwai-kolors-kolors-virtual-try-on.hf.space/',
      },
      body: JSON.stringify({
        data: [
          { path: personImagePath },
          { path: productImagePath },
          0,
          true
        ],
        event_data: null,
        fn_index: 2,
        trigger_id: 26,
        session_hash: sessionHash
      })
    });

    if (!tryOnResponse.ok) {
      throw new Error('Error: ' + tryOnResponse.status);
    }

    const tryOnData = await tryOnResponse.json();
    console.log('Try-on response:', tryOnData);

    return new Promise((resolve, reject) => {
      const eventSource = new EventSource(`https://kwai-kolors-kolors-virtual-try-on.hf.space/queue/data?session_hash=${sessionHash}`);

      eventSource.onmessage = function(event) {
        const data = JSON.parse(event.data);
        console.log('Received data:', data);
        if (data.msg === 'process_completed') {
          eventSource.close();
          if (data.output && data.output.data && data.output.data[0] && data.output.data[0].url) {
            resolve(data.output.data[0].url);
          } else {
            reject(new Error('Invalid or empty result data received'));
          }
        } else if (data.msg === 'process_starts') {
          console.log('Processing started');
        } else if (data.msg === 'queue_full') {
          eventSource.close();
          reject(new Error('Queue is full. Please try again later.'));
        } else if (data.msg === 'estimation') {
          console.log('Estimated time:', data.rank_eta);
        }
      };

      eventSource.onerror = function(error) {
        eventSource.close();
        reject(new Error('Error in virtual try-on process: ' + error.message));
      };
    });
  } catch (error) {
    console.error('Error in performKwaiKolorsTryOn:', error);
    throw new Error('Could not start virtual try-on: ' + error.message);
  }
}

async function uploadImage(imageUrl, uploadId, imageType) {
  console.log(`Uploading ${imageType} image:`, imageUrl);
  let blob;

  if (imageUrl.startsWith('data:')) {
    // data: URL인 경우 직접 사용
    const response = await fetch(imageUrl);
    blob = await response.blob();
  } else {
    // URL인 경우 이미지 다운로드
    try {
      const response = await fetch(imageUrl);
      blob = await response.blob();
    } catch (error) {
      console.error(`Error downloading ${imageType} image:`, error);
      throw new Error(`Failed to download ${imageType} image`);
    }
  }

  // 이미지 형식 확인
  if (blob.type !== 'image/jpeg' && blob.type !== 'image/png') {
    console.warn(`${imageType} image is not JPEG or PNG. Using original format.`);
  }

  const formData = new FormData();
  formData.append('files', blob, `${imageType}_image.jpg`);

  try {
    const uploadResponse = await fetch(`https://kwai-kolors-kolors-virtual-try-on.hf.space/upload?upload_id=${uploadId}`, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': '*/*',
        'Origin': 'https://kwai-kolors-kolors-virtual-try-on.hf.space',
        'Referer': 'https://kwai-kolors-kolors-virtual-try-on.hf.space/',
      }
    });

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload ${imageType} image`);
    }

    const responseData = await uploadResponse.json();
    console.log(`${imageType} image upload response:`, responseData);
    return responseData[0]; // 배열의 첫 번째 요소(파일 경로)만 반환
  } catch (error) {
    console.error(`Error uploading ${imageType} image:`, error);
    throw new Error(`Failed to upload ${imageType} image`);
  }
}

function generateRandomUploadId() {
  return Math.random().toString(36).substring(2, 15);
}

function generateRandomSessionHash() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

async function performReplicateTryOn(personImageUrl, productImageUrl, category) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['replicateApiToken'], function(result) {
      if (!result.replicateApiToken) {
        reject(new Error('Replicate API token is not set'));
      } else {
        const payload = {
          version: "c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4",
          input: {
            crop: false,
            seed: 42,
            steps: 30,
            category: category,
            force_dc: false,
            garm_img: productImageUrl,
            human_img: personImageUrl,
            crop: true,
            mask_only: false,
            garment_des: "clothing item"
          }
        };

        fetch('https://api.replicate.com/v1/predictions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${result.replicateApiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })
        .then(response => {
          if (!response.ok) {
            throw new Error('Network response was not ok');
          }
          return response.json();
        })
        .then(resolve)
        .catch(reject);
      }
    });
  });
}

async function checkPredictionStatus(predictionId) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['replicateApiToken'], function(result) {
      if (!result.replicateApiToken) {
        reject(new Error('Replicate API token is not set'));
      } else {
        fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
          headers: {
            'Authorization': `Bearer ${result.replicateApiToken}`,
          },
        })
        .then(response => {
          if (!response.ok) {
            throw new Error('Network response was not ok');
          }
          return response.json();
        })
        .then(resolve)
        .catch(reject);
      }
    });
  });
}