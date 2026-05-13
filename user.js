function getMvpUser() {
  const saved = localStorage.getItem("foodMoodUser");

  if (!saved) {
    window.location.href = "login.html";
    return null;
  }

  return JSON.parse(saved);
}

function logoutMvpUser() {
  localStorage.removeItem("foodMoodUser");
  window.location.href = "login.html";
}