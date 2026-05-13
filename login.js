const existingUser = localStorage.getItem("foodMoodUser");

if (existingUser) {
  window.location.href = "index.html";
}

function normalizeName(name) {
  return name.trim().toLowerCase();
}

document.getElementById("startButton").addEventListener("click", async () => {
  const rawName = document.getElementById("displayName").value.trim();

  if (!rawName) {
    alert("請輸入你的暱稱");
    return;
  }

  const normalizedName = normalizeName(rawName);

  // 1. 先找是否已有相同暱稱
  const { data: existingUserData, error: searchError } = await db
    .from("app_users")
    .select("*")
    .eq("display_name_normalized", normalizedName)
    .maybeSingle();

  if (searchError) {
    alert(searchError.message);
    return;
  }

  let user;

  // 2. 如果已有 user，直接沿用同一個 id
  if (existingUserData) {
    user = {
      id: existingUserData.id,
      name: existingUserData.display_name,
      createdAt: existingUserData.created_at
    };
  } else {
    // 3. 如果沒有，才建立新 user
    user = {
      id: crypto.randomUUID(),
      name: rawName,
      createdAt: new Date().toISOString()
    };

    const { error: insertError } = await db.from("app_users").insert({
      id: user.id,
      display_name: user.name,
      display_name_normalized: normalizedName
    });

    if (insertError) {
      alert(insertError.message);
      return;
    }
  }

  localStorage.setItem("foodMoodUser", JSON.stringify(user));
  window.location.href = "index.html";
});