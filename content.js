chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === 'analyzeProductImages') {
    getProductImageUrls().then(result => {
      sendResponse(result);
    });
    return true; // 비동기 응답을 위해 true 반환
  }
});

// 페이지 로드 시 자동으로 분석 실행
window.addEventListener('load', () => {
  getProductImageUrls();
});

async function getProductImageUrls() {
  const images = Array.from(document.getElementsByTagName('img'));
  const productImageUrls = [];

  for (const img of images) {
    if (img.width >= 100 && img.height >= 100) { // 최소 크기 조건
      productImageUrls.push(img.src);
    }
  }

  console.log('Found product images:', productImageUrls);
  return { productImageUrls };
}
