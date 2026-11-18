(function () {
  "use strict";

  const config = window.SUPABASE_CONFIG || {};
  const configured = Boolean(config.url && config.anonKey &&
    !config.url.includes("YOUR_") && !config.anonKey.includes("YOUR_"));
  const state = { users: [], artworks: [] };
  const palette = ["#9f775e", "#829078", "#9d8caf", "#c18a68", "#718995", "#b08e50"];
  const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
  let supabaseClient = null;
  let currentUser = null;
  let portfolioUserId = null;
  let authMode = "login";
  let selectedImage = null;
  let editingArtworkId = null;
  let activeArtistIndex = 0;
  let profilePhotoFile = null;
  let profilePhotoRemoved = false;

  const $ = id => document.getElementById(id);
  const escapeHTML = value => String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const reportError = (error, target) => {
    console.error(error);
    if (target) target.textContent = error.message || "Something went wrong. Please try again.";
  };
  const artworkUser = item => state.users.find(user => user.id === item.userId);

  function showSection(section) {
    $("homeView").classList.toggle("hidden", section !== "home");
    $("portfolioSection").classList.toggle("hidden", section !== "portfolio");
    $("studioSection").classList.toggle("hidden", section !== "studio");
    $("adminSection").classList.toggle("hidden", section !== "admin");
    if (section !== "portfolio") portfolioUserId = null;
    if (section === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      requestAnimationFrame(updateArtistPosition);
    }
  }

  function updateArtistPosition() {
    const track = $("artistGrid");
    const cards = Array.from(track.querySelectorAll(".artist-card"));
    const count = cards.length;
    if (count && track.clientWidth) {
      const center = track.getBoundingClientRect().left + track.clientWidth / 2;
      let closestDistance = Infinity;
      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const distance = Math.abs(rect.left + rect.width / 2 - center);
        if (distance < closestDistance) {
          closestDistance = distance;
          activeArtistIndex = index;
        }
      });
    } else {
      activeArtistIndex = count ? Math.max(0, Math.min(count - 1, activeArtistIndex)) : 0;
    }
    cards.forEach((card, index) => {
      card.classList.toggle("is-active", index === activeArtistIndex);
      card.classList.toggle("is-prev", index === activeArtistIndex - 1);
      card.classList.toggle("is-next", index === activeArtistIndex + 1);
    });
    $("artistPosition").textContent = count ? `${activeArtistIndex + 1} / ${count}` : "0 / 0";
    $("previousArtist").disabled = count < 2 || activeArtistIndex === 0;
    $("nextArtist").disabled = count < 2 || activeArtistIndex === count - 1;
    $("previousArtist").classList.toggle("hidden", count < 2);
    $("nextArtist").classList.toggle("hidden", count < 2);
  }

  function moveArtist(direction) {
    const track = $("artistGrid");
    if (!track.clientWidth) return;
    const cards = track.querySelectorAll(".artist-card");
    const nextIndex = Math.max(0, Math.min(cards.length - 1, activeArtistIndex + direction));
    if (cards[nextIndex]) cards[nextIndex].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  async function refreshState() {
    if (!supabaseClient) return;
    const [profilesResult, artworksResult] = await Promise.all([
      supabaseClient.from("profiles")
        .select("id,display_name,medium,bio,profile_image,role")
        .order("created_at", { ascending: true }),
      supabaseClient.from("artworks")
        .select("id,user_id,title,description,medium,image_url,status,review_note,color,created_at")
        .order("created_at", { ascending: false })
    ]);
    if (profilesResult.error) throw profilesResult.error;
    if (artworksResult.error) throw artworksResult.error;
    state.users = profilesResult.data.map(profile => ({
      id: profile.id,
      name: profile.display_name,
      medium: profile.medium || "",
      bio: profile.bio || "",
      profileImage: profile.profile_image || "",
      role: profile.role
    }));
    state.artworks = artworksResult.data.map(item => ({
      id: item.id,
      userId: item.user_id,
      title: item.title,
      description: item.description || "",
      medium: item.medium || "",
      imageData: item.image_url || "",
      status: item.status,
      reviewNote: item.review_note || "",
      color: item.color || "",
      createdAt: item.created_at
    }));
    if (currentUser) {
      const profile = state.users.find(user => user.id === currentUser.id);
      if (profile) currentUser = { ...profile, email: currentUser.email };
      else currentUser = null;
    }
    render();
  }

  async function loadCurrentUser(authUser) {
    if (!authUser) {
      currentUser = null;
      await refreshState();
      return;
    }
    const { data, error } = await supabaseClient.from("profiles")
      .select("id,display_name,medium,bio,profile_image,role")
      .eq("id", authUser.id)
      .single();
    if (error) throw error;
    currentUser = {
      id: data.id,
      name: data.display_name,
      email: authUser.email || "",
      medium: data.medium || "",
      bio: data.bio || "",
      profileImage: data.profile_image || "",
      role: data.role
    };
    await refreshState();
  }

  async function uploadImage(file, userId, category) {
    if (!file) return null;
    const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${userId}/${category}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabaseClient.storage.from("portfolio-images")
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (error) throw error;
    const { data } = supabaseClient.storage.from("portfolio-images").getPublicUrl(path);
    return data.publicUrl;
  }

  function renderArtists() {
    const members = state.users.filter(user => user.role === "artist");
    $("artistGrid").innerHTML = members.length ? members.map((user, index) => {
      const count = state.artworks.filter(item => item.userId === user.id && item.status === "approved").length;
      const color = palette[index % palette.length];
      return `<button class="artist-card" data-artist="${escapeHTML(user.id)}">
        <div class="artist-portrait" style="--portrait-color:${color}">
          ${user.profileImage ? `<img class="artist-photo" src="${escapeHTML(user.profileImage)}" alt="Portrait of ${escapeHTML(user.name)}">` : `<span class="portrait-initial">${escapeHTML(user.name.charAt(0))}</span>`}
          <div class="artist-meta"><div><strong>${escapeHTML(user.name)}</strong><small>${escapeHTML(user.medium || "Family artist")} · ${count} ${count === 1 ? "work" : "works"}</small><span class="artist-bio">${escapeHTML(user.bio || "A member of the De Vera family.")}</span></div><span class="arrow">↗</span></div>
        </div>
      </button>`;
    }).join("") : `<div class="empty"><strong>No artists yet</strong>Create a family member account to get started.</div>`;
    $("artistGrid").querySelectorAll("[data-artist]").forEach(card =>
      card.addEventListener("click", () => openPortfolio(card.dataset.artist)));
    $("artistGrid").scrollLeft = 0;
    activeArtistIndex = 0;
    updateArtistPosition();
  }

  function artMarkup(item, options) {
    const owner = artworkUser(item);
    const isAdmin = options && options.admin;
    const showStatus = options && options.status;
    const removable = options && options.owner;
    const image = item.imageData
      ? `<img src="${escapeHTML(item.imageData)}" alt="${escapeHTML(item.title)}">`
      : `<span class="art-abstract" style="background:${escapeHTML(item.color || "#b7c4a4")}"></span>`;
    let controls = "";
    if (isAdmin && item.status === "pending") {
      controls = `<div class="review-actions"><button class="button small" data-review="approve" data-id="${escapeHTML(item.id)}">Approve</button><button class="button reject" data-review="reject" data-id="${escapeHTML(item.id)}">Decline</button></div>`;
    } else if (removable) {
      controls = `<span><button class="text-button" data-edit="${escapeHTML(item.id)}">Edit</button><button class="text-button" data-delete="${escapeHTML(item.id)}">Delete</button></span>`;
    }
    return `<article class="art-card">
      <div class="art-image">${image}</div>
      <div class="art-info"><h3>${escapeHTML(item.title)}</h3>
        <p>${escapeHTML(owner ? owner.name : "Family artist")} · ${escapeHTML(item.medium || "Artwork")}</p>
        ${item.description ? `<p style="margin-top:8px;line-height:1.5">${escapeHTML(item.description)}</p>` : ""}
        <div class="art-footer">${showStatus ? `<span class="tag ${escapeHTML(item.status)}">${escapeHTML(item.status)}</span>` : `<span class="tag">${escapeHTML(item.medium || "Artwork")}</span>`}${controls}</div>
        ${item.status === "rejected" && item.reviewNote ? `<p class="status-line">Admin note: ${escapeHTML(item.reviewNote)}</p>` : ""}
      </div>
    </article>`;
  }

  function openPortfolio(userId) {
    const user = state.users.find(item => item.id === userId && item.role === "artist");
    if (!user) return;
    portfolioUserId = userId;
    $("portfolioTitle").textContent = user.name;
    $("portfolioBio").textContent = [user.medium, user.bio].filter(Boolean).join(" · ") || "A member of the De Vera family.";
    const works = state.artworks.filter(item => item.userId === userId && item.status === "approved");
    $("portfolioGrid").innerHTML = works.length ? works.map(item => artMarkup(item)).join("") : `<div class="empty"><strong>Portfolio in progress</strong>This artist's approved work will appear here.</div>`;
    showSection("portfolio");
    $("portfolioSection").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderStudio() {
    if (!currentUser || currentUser.role !== "artist") return;
    const items = state.artworks.filter(item => item.userId === currentUser.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    $("studioGrid").innerHTML = items.length ? items.map(item =>
      artMarkup(item, { status: true, owner: true })).join("") :
      `<div class="empty"><strong>Your gallery starts here</strong>Submit your first artwork for admin review.</div>`;
    $("studioGrid").querySelectorAll("[data-delete]").forEach(button =>
      button.addEventListener("click", () => deleteArtwork(button.dataset.delete)));
    $("studioGrid").querySelectorAll("[data-edit]").forEach(button =>
      button.addEventListener("click", () => editArtwork(button.dataset.edit)));
  }

  function editArtwork(id) {
    const item = state.artworks.find(work => work.id === id && work.userId === currentUser.id);
    if (!item) return;
    editingArtworkId = item.id;
    selectedImage = null;
    $("uploadForm").reset();
    $("uploadError").textContent = "";
    $("uploadTitle").textContent = "Edit artwork";
    $("uploadSubmit").textContent = "Submit changes for review";
    $("artTitle").value = item.title;
    $("artDescription").value = item.description || "";
    $("artMedium").value = item.medium || "";
    $("imagePreview").style.display = item.imageData ? "block" : "none";
    if (item.imageData) $("imagePreview").src = item.imageData;
    $("uploadBackdrop").classList.remove("hidden");
    $("artTitle").focus();
  }

  async function deleteArtwork(id) {
    if (!confirm("Delete this artwork submission?")) return;
    try {
      const { error } = await supabaseClient.from("artworks").delete().eq("id", id);
      if (error) throw error;
      await refreshState();
    } catch (error) {
      alert(error.message || "The artwork could not be deleted.");
      reportError(error);
    }
  }

  function renderAdmin() {
    const pending = state.artworks.filter(item => item.status === "pending");
    $("adminGrid").innerHTML = pending.length ? pending.map(item =>
      artMarkup(item, { status: true, admin: true })).join("") :
      `<div class="empty"><strong>All caught up</strong>There are no submissions waiting for review.</div>`;
    $("adminGrid").querySelectorAll("[data-review]").forEach(button =>
      button.addEventListener("click", () => reviewArtwork(button.dataset.id, button.dataset.review)));
  }

  async function reviewArtwork(id, action) {
    const reviewNote = action === "reject" ? (prompt("Optional note for the artist:") || "") : "";
    const update = { status: action === "approve" ? "approved" : "rejected", review_note: reviewNote };
    try {
      const { error } = await supabaseClient.from("artworks").update(update).eq("id", id);
      if (error) throw error;
      await refreshState();
    } catch (error) {
      alert(error.message || "The artwork review could not be saved.");
      reportError(error);
    }
  }

  function render() {
    renderArtists();
    if (currentUser) {
      $("loginButton").innerHTML = `<span class="account-label">${escapeHTML(currentUser.name)}</span> · Sign out`;
      $("manageLink").classList.remove("hidden");
      $("adminLink").classList.toggle("hidden", currentUser.role !== "admin");
      if (currentUser.role === "artist") renderStudio();
      else $("studioGrid").innerHTML = `<div class="empty"><strong>Admin account</strong>Use Review posts to manage submissions.</div>`;
      renderAdmin();
    } else {
      $("loginButton").textContent = "login/sign-up";
      $("manageLink").classList.add("hidden");
      $("adminLink").classList.add("hidden");
    }
    if (portfolioUserId) {
      const user = state.users.find(item => item.id === portfolioUserId && item.role === "artist");
      if (user) {
        $("portfolioTitle").textContent = user.name;
        $("portfolioBio").textContent = [user.medium, user.bio].filter(Boolean).join(" · ") || "A member of the De Vera family.";
        const works = state.artworks.filter(item => item.userId === user.id && item.status === "approved");
        $("portfolioGrid").innerHTML = works.length ? works.map(item => artMarkup(item)).join("") : `<div class="empty"><strong>Portfolio in progress</strong>This artist's approved work will appear here.</div>`;
      }
    }
  }

  function openAuth(mode) {
    authMode = mode;
    $("authTitle").textContent = mode === "login" ? "Welcome back" : "Join the family";
    $("authIntro").textContent = mode === "login" ? "Sign in to manage your artist profile and artwork." : "Create your artist account to share work with your family.";
    $("demoAccounts").classList.toggle("hidden", mode !== "login");
    $("nameField").classList.toggle("hidden", mode === "login");
    $("authName").required = mode === "register";
    $("authPassword").autocomplete = mode === "login" ? "current-password" : "new-password";
    $("authSubmit").textContent = mode === "login" ? "Sign in" : "Create account";
    $("switchPrompt").textContent = mode === "login" ? "New to the family gallery?" : "Already have an account?";
    $("switchAuth").textContent = mode === "login" ? "Create an account" : "Sign in";
    $("authError").textContent = configured ? "" : "Shared accounts are not connected yet. Configure Supabase using the README setup steps.";
    $("authSubmit").disabled = !configured;
    $("authForm").reset();
    $("authBackdrop").classList.remove("hidden");
    $("authEmail").focus();
  }

  function closeModal(id) {
    $(id).classList.add("hidden");
  }

  async function submitProfile(event) {
    event.preventDefault();
    if (!currentUser) return;
    $("profilePhotoError").textContent = "";
    try {
      let profileImage = profilePhotoRemoved ? null : currentUser.profileImage || null;
      if (profilePhotoFile) profileImage = await uploadImage(profilePhotoFile, currentUser.id, "profile");
      const { error } = await supabaseClient.from("profiles").update({
        display_name: $("profileName").value.trim(),
        medium: $("profileMedium").value.trim(),
        bio: $("profileBio").value.trim(),
        profile_image: profileImage
      }).eq("id", currentUser.id);
      if (error) throw error;
      $("profilePanel").classList.add("hidden");
      profilePhotoFile = null;
      profilePhotoRemoved = false;
      await refreshState();
    } catch (error) {
      reportError(error, $("profilePhotoError"));
    }
  }

  async function deleteAccount() {
    if (!currentUser || currentUser.role !== "artist") return;
    if (!confirm(`Permanently delete ${currentUser.name}'s account and all of their artwork? This cannot be undone.`)) return;
    try {
      const { error } = await supabaseClient.rpc("delete_my_account");
      if (error) throw error;
      await supabaseClient.auth.signOut();
      currentUser = null;
      $("profilePanel").classList.add("hidden");
      showSection("home");
      await refreshState();
      alert("Your account and artwork have been deleted.");
    } catch (error) {
      alert(error.message || "The account could not be deleted.");
      reportError(error);
    }
  }

  async function submitArtwork(event) {
    event.preventDefault();
    if (!currentUser || currentUser.role !== "artist") return;
    $("uploadError").textContent = "";
    $("uploadSubmit").disabled = true;
    try {
      const existing = editingArtworkId && state.artworks.find(item => item.id === editingArtworkId && item.userId === currentUser.id);
      if (editingArtworkId && !existing) throw new Error("This artwork is no longer available to edit.");
      let imageUrl = existing ? existing.imageData : null;
      if (selectedImage) imageUrl = await uploadImage(selectedImage, currentUser.id, "artwork");
      const artwork = {
        user_id: currentUser.id,
        title: $("artTitle").value.trim(),
        description: $("artDescription").value.trim(),
        medium: $("artMedium").value.trim() || "Artwork",
        image_url: imageUrl,
        status: "pending",
        review_note: "",
        color: palette[Math.floor(Math.random() * palette.length)]
      };
      const result = editingArtworkId
        ? await supabaseClient.from("artworks").update(artwork).eq("id", editingArtworkId)
        : await supabaseClient.from("artworks").insert(artwork);
      if (result.error) throw result.error;
      editingArtworkId = null;
      selectedImage = null;
      closeModal("uploadBackdrop");
      showSection("studio");
      await refreshState();
    } catch (error) {
      reportError(error, $("uploadError"));
    } finally {
      $("uploadSubmit").disabled = false;
    }
  }

  async function submitAuth(event) {
    event.preventDefault();
    if (!supabaseClient) return;
    $("authError").textContent = "";
    $("authSubmit").disabled = true;
    const email = $("authEmail").value.trim().toLowerCase();
    const password = $("authPassword").value;
    try {
      if (authMode === "login") {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await loadCurrentUser(data.user);
        closeModal("authBackdrop");
        showSection(currentUser.role === "admin" ? "admin" : "studio");
      } else {
        const name = $("authName").value.trim();
        if (!name) throw new Error("Please enter your name.");
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: { data: { display_name: name } }
        });
        if (error) throw error;
        if (!data.session) {
          $("authError").textContent = "Check your email to confirm the account, then sign in. The profile will appear after confirmation.";
          return;
        }
        await loadCurrentUser(data.user);
        closeModal("authBackdrop");
        showSection("studio");
      }
      render();
    } catch (error) {
      reportError(error, $("authError"));
    } finally {
      $("authSubmit").disabled = !configured;
    }
  }

  function initialize() {
    $("year").textContent = new Date().getFullYear();
    if (!configured) {
      $("setupNotice").textContent = "Shared profiles are not connected yet. The site owner must configure Supabase before accounts can sync across devices.";
      $("setupNotice").classList.remove("hidden");
      render();
      showSection("home");
      return;
    }
    if (!window.supabase || !window.supabase.createClient) {
      $("setupNotice").textContent = "The account service could not load. Check your internet connection and reload.";
      $("setupNotice").classList.remove("hidden");
      render();
      showSection("home");
      return;
    }
    supabaseClient = window.supabase.createClient(config.url, config.anonKey);
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (["SIGNED_OUT", "SIGNED_IN", "INITIAL_SESSION", "USER_UPDATED"].includes(event)) {
        setTimeout(() => loadCurrentUser(session && session.user).catch(error => reportError(error)), 0);
      }
    });
    refreshState().catch(error => {
      $("setupNotice").textContent = `Could not connect to the shared gallery: ${error.message}`;
      $("setupNotice").classList.remove("hidden");
      reportError(error);
    });
  }

  $("homeLink").addEventListener("click", event => { event.preventDefault(); showSection("home"); });
  $("artistsLink").addEventListener("click", () => showSection("home"));
  $("artistGrid").addEventListener("scroll", updateArtistPosition, { passive: true });
  $("previousArtist").addEventListener("click", () => moveArtist(-1));
  $("nextArtist").addEventListener("click", () => moveArtist(1));
  $("loginButton").addEventListener("click", async () => {
    if (!currentUser) { openAuth("login"); return; }
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
      currentUser = null;
      $("profilePanel").classList.add("hidden");
      showSection("home");
      await refreshState();
    } catch (error) { reportError(error); }
  });
  $("manageLink").addEventListener("click", () => {
    if (currentUser && currentUser.role === "admin") {
      showSection("admin");
      $("adminSection").scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      showSection("studio");
      renderStudio();
      $("studioSection").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  $("adminLink").addEventListener("click", () => {
    showSection("admin");
    $("adminSection").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("backHomeButton").addEventListener("click", () => showSection("home"));
  $("editProfileButton").addEventListener("click", () => {
    $("profileName").value = currentUser.name;
    $("profileMedium").value = currentUser.medium || "";
    $("profileBio").value = currentUser.bio || "";
    profilePhotoFile = null;
    profilePhotoRemoved = false;
    $("profilePhotoError").textContent = "";
    $("profilePhotoInput").value = "";
    $("profilePhotoPreview").classList.toggle("hidden", !currentUser.profileImage);
    if (currentUser.profileImage) $("profilePhotoPreview").src = currentUser.profileImage;
    $("removeProfilePhoto").classList.toggle("hidden", !currentUser.profileImage);
    $("profilePanel").classList.remove("hidden");
  });
  $("cancelProfile").addEventListener("click", () => $("profilePanel").classList.add("hidden"));
  $("profilePhotoInput").addEventListener("change", () => {
    const file = $("profilePhotoInput").files[0];
    $("profilePhotoError").textContent = "";
    if (!file) return;
    if (!allowedImageTypes.has(file.type)) {
      $("profilePhotoError").textContent = "Choose a JPEG, PNG, GIF or WebP image.";
      $("profilePhotoInput").value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      $("profilePhotoError").textContent = "Please choose an image smaller than 2 MB.";
      $("profilePhotoInput").value = "";
      return;
    }
    profilePhotoFile = file;
    $("profilePhotoPreview").src = URL.createObjectURL(file);
    $("profilePhotoPreview").classList.remove("hidden");
    $("removeProfilePhoto").classList.remove("hidden");
  });
  $("removeProfilePhoto").addEventListener("click", () => {
    profilePhotoFile = null;
    profilePhotoRemoved = true;
    $("profilePhotoInput").value = "";
    $("profilePhotoPreview").classList.add("hidden");
    $("removeProfilePhoto").classList.add("hidden");
  });
  $("profileForm").addEventListener("submit", submitProfile);
  $("deleteAccountButton").addEventListener("click", deleteAccount);
  $("uploadButton").addEventListener("click", () => {
    editingArtworkId = null;
    $("uploadTitle").textContent = "Submit artwork";
    $("uploadSubmit").textContent = "Submit for review";
    $("uploadForm").reset();
    $("uploadError").textContent = "";
    $("imagePreview").style.display = "none";
    selectedImage = null;
    $("uploadBackdrop").classList.remove("hidden");
    $("artTitle").focus();
  });
  $("artImage").addEventListener("change", () => {
    const file = $("artImage").files[0];
    selectedImage = null;
    $("imagePreview").style.display = "none";
    if (!file) return;
    if (!allowedImageTypes.has(file.type)) {
      $("uploadError").textContent = "Choose a JPEG, PNG, GIF or WebP image.";
      $("artImage").value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      $("uploadError").textContent = "Please choose an image smaller than 2 MB.";
      $("artImage").value = "";
      return;
    }
    selectedImage = file;
    $("imagePreview").src = URL.createObjectURL(file);
    $("imagePreview").style.display = "block";
  });
  $("uploadForm").addEventListener("submit", submitArtwork);
  $("authForm").addEventListener("submit", submitAuth);
  $("switchAuth").addEventListener("click", () => openAuth(authMode === "login" ? "register" : "login"));
  document.querySelectorAll("[data-close]").forEach(button =>
    button.addEventListener("click", () => closeModal(button.dataset.close)));
  document.querySelectorAll(".modal-backdrop").forEach(backdrop =>
    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) closeModal(backdrop.id);
    }));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") document.querySelectorAll(".modal-backdrop")
      .forEach(backdrop => closeModal(backdrop.id));
  });

  render();
  showSection("home");
  initialize();
}());
