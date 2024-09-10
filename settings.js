document.getElementById('settingsForm').addEventListener('submit', function (e) {
  e.preventDefault();
  const replicateApiToken = document.getElementById('replicateApiToken').value;

  chrome.storage.local.set({ replicateApiToken: replicateApiToken }, function() {
    document.getElementById('saveSettings').innerHTML = 'Saved';
    setTimeout(() => {
      if (replicateApiToken) {
        hideSettings();
      }
    }, 1000);
  });
});

function loadSettings() {
  chrome.storage.local.get(['replicateApiToken'], function(result) {
    if (result.replicateApiToken) {
      document.getElementById('replicateApiToken').value = result.replicateApiToken;
    }
  });
}

// Populate form with existing values
document.addEventListener('DOMContentLoaded', loadSettings);

// Add these functions to handle settings visibility
function showSettings() {
  document.getElementById('mainContent').style.display = 'none';
  document.getElementById('settingsContent').style.display = 'block';
}

function hideSettings() {
  document.getElementById('mainContent').style.display = 'block';
  document.getElementById('settingsContent').style.display = 'none';
}

function toggleSettings() {
  const settingsContent = document.getElementById('settingsContent');
  if (settingsContent.style.display === 'none') {
    showSettings();
  } else {
    hideSettings();
  }
}
