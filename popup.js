document.addEventListener('DOMContentLoaded', function () {
  const tryOnButton = document.getElementById('tryOn');
  const resultDiv = document.getElementById('result');
  const loader = document.getElementById('loader');
  const loadingMessage = document.getElementById('loadingMessage');
  const personImageInput = document.getElementById('personImage');
  const cachedImagesDiv = document.getElementById('cachedImages');

  let selectedImageUrl = null;
  let selectedProductImageUrl = null;

  // Load and display cached images
  loadCachedImages();

  // Create and append the upload new image button
  const uploadNewImage = document.createElement('label');
  uploadNewImage.id = 'uploadNewImage';
  uploadNewImage.textContent = '+';
  uploadNewImage.setAttribute('for', 'personImage');
  cachedImagesDiv.appendChild(uploadNewImage);

  personImageInput.addEventListener('change', function () {
    if (this.files.length > 0) {
      const file = this.files[0];
      const reader = new FileReader();
      reader.onload = function (e) {
        uploadNewImage.innerHTML = `
          <img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0;">
          <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 24px; color: white; text-shadow: 0 0 3px rgba(0,0,0,0.5);">+</span>
        `;
        // 새 이미지를 캐시하고 표시
        const newCachedImage = cacheImage(e.target.result);
        if (newCachedImage) {
          selectCachedImage(newCachedImage, e.target.result);
        }
      };
      reader.readAsDataURL(file);
      tryOnButton.disabled = false;
      selectedImageUrl = null;
      // Deselect any previously selected cached image
      document
        .querySelectorAll('.cached-image')
        .forEach((img) => img.classList.remove('selected'));
    } else {
      resetUploadButton();
      tryOnButton.disabled = !selectedImageUrl;
    }
  });

  tryOnButton.addEventListener('click', function () {
    if (selectedImageUrl && selectedProductImageUrl) {
      performVirtualTryOn(selectedImageUrl, selectedProductImageUrl, window.location.href);
    } else {
      alert('Please select both a person image and a product image.');
    }
  });

  function resetUploadButton() {
    uploadNewImage.innerHTML = '<span style="font-size: 24px;">+</span>';
  }

  // 라디오 버튼 변경 이벤트 리스너 수정
  document.querySelector('.radio-group').addEventListener('change', function(event) {
    const replicateCategory = document.getElementById('replicateCategory');
    if (event.target.value === 'replicate') {
      replicateCategory.style.display = 'inline-block';
    } else {
      replicateCategory.style.display = 'none';
    }
  });

  // tryOnButton 텍스트 변경
  tryOnButton.textContent = '시착하기';

  // performVirtualTryOn 함수 수정
  function performVirtualTryOn(personImageUrl, productImageUrl, currentPageUrl) {
    loader.style.display = 'block';
    loadingMessage.style.display = 'block';
    resultDiv.textContent = '';
    tryOnButton.disabled = true;

    const selectedOption = document.querySelector('input[name="tryOnOption"]:checked').value;

    if (selectedOption === 'kwai-kolors') {
      performKwaiKolorsTryOn(personImageUrl, productImageUrl, currentPageUrl);
    } else {
      const replicateApiToken = localStorage.getItem('replicateApiToken');
      if (!replicateApiToken) {
        showError('Replicate API token is not set. Please check your settings.');
        showSettings(); // 설정 페이지를 표시하는 함수
        return;
      }
      const category = document.getElementById('replicateCategory').value;
      performReplicateTryOn(personImageUrl, productImageUrl, category);
    }
  }

  function performKwaiKolorsTryOn(personImageUrl, productImageUrl, currentPageUrl) {
    chrome.runtime.sendMessage({
      action: 'performKwaiKolorsTryOn',
      personImageUrl,
      productImageUrl: productImageUrl,
      currentPageUrl
    }, response => {
      if (response.success) {
        showProgressBar();
        saveState({
          inProgress: true,
          method: 'kwai-kolors',
          personImageUrl,
          productImageUrl,
          currentPageUrl
        });
      } else {
        if (response.error === 'A task is already in progress') {
          showProgressBar();
          loadState();
        } else {
          console.error('KwaiKolors error:', response.error);
          showError('Error in KwaiKolors process: ' + response.error);
        }
      }
    });
  }

  // 프로그레스 바 표시 함수 수정
  function showProgressBar() {
    loader.style.display = 'block';
    loadingMessage.style.display = 'block';
    loadingMessage.innerHTML = 'Processing...';
  }

  function performReplicateTryOn(personImageUrl, productImageUrl, category) {
    chrome.runtime.sendMessage({
      action: 'performReplicateTryOn',
      personImageUrl,
      productImageUrl,
      category
    }, response => {
      if (response.success) {
        showProgressBar();
        saveState({
          inProgress: true,
          method: 'replicate',
          personImageUrl,
          productImageUrl,
          category,
          predictionId: response.predictionId
        });
        checkPredictionStatus(response.predictionId);
      } else {
        showError('Error starting virtual try-on: ' + response.error);
      }
    });
  }

  function checkPredictionStatus(predictionId) {
    chrome.runtime.sendMessage({
      action: 'checkPredictionStatus',
      predictionId
    }, response => {
      if (response.success) {
        if (response.status === 'succeeded') {
          displayResult(response.output);
        } else if (response.status === 'failed') {
          showError('Virtual try-on failed: ' + response.error);
        } else {
          setTimeout(() => checkPredictionStatus(predictionId), 1000);
        }
      } else {
        showError('Error checking prediction status: ' + response.error);
      }
    });
  }

  function displayResult(output) {
    loader.style.display = 'none';
    loadingMessage.style.display = 'none';
    
    console.log('Received output:', output); // 디버깅을 위해 출력 로그 추가

    if (typeof output === 'string') {
      // 단일 이미지 URL인 경우
      saveAndDisplayGeneratedImage(output);
    } else if (Array.isArray(output)) {
      // 여러 이미지 URL이 배열로 온 경우
      output.forEach(url => saveAndDisplayGeneratedImage(url));
    } else if (typeof output === 'object' && output.url) {
      // 객체 형태로 URL이 포함된 경우
      saveAndDisplayGeneratedImage(output.url);
    } else {
      console.error('Unexpected output format:', output);
      showError('결과를 표시할 수 없습니다. 예상치 못한 형식입니다.');
    }
    
    tryOnButton.disabled = false;

    // 알림 보내기
    chrome.runtime.sendMessage({
      action: 'sendNotification',
      title: 'Virtual Try-On 완료',
      message: '새로운 이미지가 생성되었습니다!'
    });

    // 시각적 알림 추가
    const notification = document.createElement('div');
    notification.textContent = '새로운 이미지가 생성되었습니다!';
    notification.style.backgroundColor = '#4CAF50';
    notification.style.color = 'white';
    notification.style.padding = '10px';
    notification.style.borderRadius = '5px';
    notification.style.marginTop = '10px';
    notification.style.textAlign = 'center';
    resultDiv.insertBefore(notification, resultDiv.firstChild);

    // 3초 후 알림 제거
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  function saveAndDisplayGeneratedImage(imageUrl) {
    const generatedImagesContainer = document.getElementById('generatedImages');
    if (!generatedImagesContainer) {
      const newGeneratedImagesContainer = document.createElement('div');
      newGeneratedImagesContainer.id = 'generatedImages';
      newGeneratedImagesContainer.innerHTML = '<h3>생성된 이미지</h3>';
      const imageGrid = document.createElement('div');
      imageGrid.id = 'generatedImagesGrid';
      imageGrid.style.display = 'flex';
      imageGrid.style.flexWrap = 'wrap';
      imageGrid.style.gap = '10px';
      newGeneratedImagesContainer.appendChild(imageGrid);
      resultDiv.appendChild(newGeneratedImagesContainer);
    }

    const imageGrid = document.getElementById('generatedImagesGrid');
    
    const imgContainer = document.createElement('div');
    imgContainer.className = 'image-container generated-image-container';
    
    const img = document.createElement('img');
    img.src = imageUrl;
    img.className = 'generated-image';
    img.style.width = '100px';
    img.style.height = '100px';
    img.style.objectFit = 'cover';
    img.style.borderRadius = '5px';
    img.addEventListener('click', () => downloadImage(imageUrl));
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '×';
    deleteBtn.className = 'delete-generated-btn';
    deleteBtn.addEventListener('click', () => deleteGeneratedImage(imgContainer));

    imgContainer.appendChild(img);
    imgContainer.appendChild(deleteBtn);
    imageGrid.appendChild(imgContainer);

    // 삭제 버튼이 없으면 추가
    if (!document.getElementById('deleteAllGenerated')) {
      const deleteButton = document.createElement('button');
      deleteButton.id = 'deleteAllGenerated';
      deleteButton.textContent = '모든 생성된 이미지 삭제';
      deleteButton.addEventListener('click', deleteAllGeneratedImages);
      document.getElementById('generatedImages').insertBefore(deleteButton, imageGrid);
    }

    console.log('Image displayed:', imageUrl);
  }

  function downloadImage(url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'generated-image.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function deleteGeneratedImage(imgContainer) {
    imgContainer.remove();
    if (document.querySelectorAll('.generated-image-container').length === 0) {
      document.getElementById('generatedImages').remove();
    }
  }

  function deleteAllGeneratedImages() {
    const imageGrid = document.getElementById('generatedImagesGrid');
    if (imageGrid) {
      imageGrid.innerHTML = '';
    }
    
    // 삭제 버튼도 제거
    const deleteButton = document.getElementById('deleteAllGenerated');
    if (deleteButton) {
      deleteButton.remove();
    }
  }

  const settingsButton = document.getElementById('settingsButton');
  settingsButton.addEventListener('click', toggleSettings);

  checkAndShowSettings();

  function checkAndShowSettings() {
    const replicateApiToken = localStorage.getItem('replicateApiToken');
    if (!replicateApiToken) {
      showSettings();
    }
  }

  // 페이지 분석 버튼에 이벤트 리스너 추가
  const analyzeButton = document.getElementById('analyzeButton');
  if (analyzeButton) {
    analyzeButton.addEventListener('click', function() {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {action: 'analyzeProductImages'}, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            showError('페이지 분석 중 오류가 발생했습니다: ' + chrome.runtime.lastError.message);
          } else if (response && response.productImageUrls) {
            console.log(`${response.productImageUrls.length}개의 제품 이미지를 찾았습니다.`);
            cacheAndDisplayProductImages(response.productImageUrls);
          } else {
            console.log('Response:', response);
            showError('제품 이미지를 찾을 수 없습니다.');
          }
        });
      });
    });
  }

  // 팝업이 열릴 때마다 작업 상태 확인
  chrome.runtime.sendMessage({ action: 'checkTaskStatus' }, response => {
    if (response.inProgress) {
      showProgressBar();
      loadState();
    }
  });

  // 결과 수신을 위한 리스너 수정
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'tryOnCompleted') {
      if (request.success) {
        displayResult(request.result);
      } else {
        showError('Error in try-on process: ' + request.error);
      }
      loader.style.display = 'none';
      loadingMessage.style.display = 'none';
      tryOnButton.disabled = false;
      clearState();
    }
  });

  function selectCachedImage(imgElement, url) {
    if (!imgElement) return;
    document
      .querySelectorAll('.cached-image')
      .forEach((img) => img.classList.remove('selected'));
    imgElement.classList.add('selected');
    selectedImageUrl = url;
    tryOnButton.disabled = !(selectedImageUrl && selectedProductImageUrl);
    personImageInput.value = '';
    resetUploadButton();
  }

  function selectProductImage(imgContainer, url) {
    if (!imgContainer) return;
    document.querySelectorAll('.product-image-container').forEach((container) => {
      container.style.border = '2px solid transparent';
      container.style.boxShadow = 'none';
    });
    imgContainer.style.border = '2px solid #1a73e8';
    imgContainer.style.boxShadow = '0 0 0 2px rgba(26, 115, 232, 0.2)';
    selectedProductImageUrl = url;
    tryOnButton.disabled = !(selectedImageUrl && selectedProductImageUrl);
  }

  function loadCachedImages() {
    const cachedUrls = JSON.parse(
      localStorage.getItem('cachedImageUrls') || '[]'
    );
    cachedUrls.forEach((url) => {
      const imgContainer = document.createElement('div');
      imgContainer.classList.add('image-container');

      const img = document.createElement('img');
      img.src = url;
      img.classList.add('cached-image');
      img.addEventListener('click', () => selectCachedImage(img, url));

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '×';
      deleteBtn.classList.add('delete-btn');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteCachedImage(url, imgContainer);
      });

      imgContainer.appendChild(img);
      imgContainer.appendChild(deleteBtn);
      cachedImagesDiv.appendChild(imgContainer);
    });
  }

  function deleteCachedImage(url, imgContainer) {
    // Remove from localStorage
    const cachedUrls = JSON.parse(
      localStorage.getItem('cachedImageUrls') || '[]'
    );
    const updatedUrls = cachedUrls.filter((cachedUrl) => cachedUrl !== url);
    localStorage.setItem('cachedImageUrls', JSON.stringify(updatedUrls));

    // Remove from DOM
    cachedImagesDiv.removeChild(imgContainer);

    // Reset selection if the deleted image was selected
    if (selectedImageUrl === url) {
      selectedImageUrl = null;
      tryOnButton.disabled = true;
    }
  }

  function cacheImage(url) {
    const cachedUrls = JSON.parse(
      localStorage.getItem('cachedImageUrls') || '[]'
    );
    if (!cachedUrls.includes(url)) {
      cachedUrls.unshift(url);
      if (cachedUrls.length > 5) cachedUrls.pop(); // Keep only the last 5 images
      localStorage.setItem('cachedImageUrls', JSON.stringify(cachedUrls));

      const imgContainer = document.createElement('div');
      imgContainer.classList.add('image-container');

      const img = document.createElement('img');
      img.src = url;
      img.classList.add('cached-image');
      img.addEventListener('click', () => selectCachedImage(img, url));

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '×';
      deleteBtn.classList.add('delete-btn');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteCachedImage(url, imgContainer);
      });

      imgContainer.appendChild(img);
      imgContainer.appendChild(deleteBtn);
      cachedImagesDiv.insertBefore(imgContainer, uploadNewImage);

      if (cachedImagesDiv.querySelectorAll('.image-container').length > 5) {
        cachedImagesDiv.removeChild(
          cachedImagesDiv.children[cachedImagesDiv.children.length - 2]
        );
      }

      return img; // Return the newly created image element
    }
    return null;
  }

  function showError(message) {
    loader.style.display = 'none';
    loadingMessage.style.display = 'none';
    resultDiv.innerHTML = message;
    resultDiv.style.color = '#ea4335';
    tryOnButton.disabled = false;
  }

  // 팝업이 열릴 때 자동으로 페이지 분석 수행
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {action: 'analyzeProductImages'}, (response) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        console.log('페이지 분석 중 오류가 발생했습니다.');
      } else if (response && response.productImageUrls) {
        console.log(`${response.productImageUrls.length}개의 제품 이미지를 찾았습니다.`);
        cacheAndDisplayProductImages(response.productImageUrls);
      } else {
        console.log('제품 이미지를 찾을 수 없습니다.');
      }
    });
  });

  // cacheAndDisplayProductImages 함수 수정
  async function cacheAndDisplayProductImages(imageUrls) {
    const productImagesContainer = document.getElementById('productImages');
    productImagesContainer.innerHTML = '<h3>발견된 제품 이미지</h3>';
    
    const imageGrid = document.createElement('div');
    imageGrid.id = 'productImagesGrid';
    imageGrid.style.display = 'flex';
    imageGrid.style.flexWrap = 'wrap';
    imageGrid.style.gap = '10px';
    productImagesContainer.appendChild(imageGrid);
    
    for (const url of imageUrls) {
      try {
        const cachedUrl = await cacheProductImage(url);
        const imgContainer = document.createElement('div');
        imgContainer.className = 'image-container product-image-container';
        imgContainer.style.border = '2px solid transparent';
        imgContainer.style.borderRadius = '5px';
        imgContainer.style.transition = 'all 0.3s ease';

        const img = document.createElement('img');
        img.src = cachedUrl;
        img.className = 'product-image';
        img.style.width = '60px';
        img.style.height = '60px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '5px';
        img.style.cursor = 'pointer';
        img.dataset.originalUrl = url;  // 원본 URL을 데이터 속성으로 저장
        
        imgContainer.appendChild(img);
        imageGrid.appendChild(imgContainer);

        // 이미지 컨테이너에 클릭 이벤트 리스너 추가
        imgContainer.addEventListener('click', () => selectProductImage(imgContainer, url));
      } catch (error) {
        console.error('Error caching and displaying image:', error);
      }
    }

    if (imageGrid.children.length === 0) {
      productImagesContainer.innerHTML += '<p>제품 이미지를 찾을 수 없습니다.</p>';
    }
  }

  // cacheProductImage 함수 추가
  async function cacheProductImage(url) {
    const response = await fetch(url);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }

  // 설정 및 상태 로드
  loadSettings();
  loadState();

  function loadSettings() {
    chrome.storage.local.get(['replicateApiToken'], function(result) {
      if (result.replicateApiToken) {
        document.getElementById('replicateApiToken').value = result.replicateApiToken;
      }
    });
  }

  function saveSettings() {
    const replicateApiToken = document.getElementById('replicateApiToken').value;
    chrome.storage.local.set({ replicateApiToken: replicateApiToken }, function() {
      console.log('Settings saved');
    });
  }

  function loadState() {
    chrome.storage.local.get(['tryOnState'], function(result) {
      if (result.tryOnState) {
        const state = result.tryOnState;
        if (state.inProgress) {
          showProgressBar();
          if (state.personImageUrl) {
            selectCachedImage(document.querySelector(`img[src="${state.personImageUrl}"]`), state.personImageUrl);
          }
          if (state.productImageUrl) {
            const productImg = document.querySelector(`.product-image-container img[data-original-url="${state.productImageUrl}"]`);
            if (productImg && productImg.parentElement) {
              selectProductImage(productImg.parentElement, state.productImageUrl);
            } else {
              console.warn('Product image not found in the DOM');
            }
          }
          if (state.method === 'kwai-kolors') {
            // Kwai-Kolors 작업 재개
            performKwaiKolorsTryOn(state.personImageUrl, state.productImageUrl, state.currentPageUrl);
          } else if (state.method === 'replicate') {
            // Replicate 작업 재개
            checkPredictionStatus(state.predictionId);
          }
        }
      }
    });
  }

  function saveState(state) {
    chrome.storage.local.set({ tryOnState: state }, function() {
      console.log('State saved');
    });
  }

  function clearState() {
    chrome.storage.local.remove('tryOnState', function() {
      console.log('State cleared');
    });
  }
});
