document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const imageUrl = urlParams.get('imageUrl');
  
  if (imageUrl) {
    document.getElementById('try-on-image').src = imageUrl;
  }
});