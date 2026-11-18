(function () {
  "use strict";

  const config = window.SUPABASE_CONFIG || {};
  const supabaseUrl = String(config.url || "").replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
  const configured = Boolean(supabaseUrl && config.anonKey &&
    !supabaseUrl.includes("YOUR_") && !config.anonKey.includes("YOUR_"));
  const imageBucket = "devera-portfolio-images";
  const maxImageBytes = 5 * 1024 * 1024;
  const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
  const artists = [];
  const artworks = [];
  let memberArtworks = [];
  const palette = ["#9f775e", "#829078", "#9d8caf", "#c18a68", "#718995", "#b08e50"];
  let supabaseClient = null;
  let currentUser = null;
  let activeArtistIndex = 0;
  let authMode = "user";
  let profilePreviewUrl = "";

  const $ = id => document.getElementById(id);
  const escapeHTML = value => String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));

  function setAdminNotice(message) {
    $("adminNotice").textContent = message || "";
  }

  function setMemberNotice(message) {
    $("memberNotice").textContent = message || "";
  }

  function setNotice(message) {
    $("setupNotice").textContent = message;
    $("setupNotice").classList.toggle("hidden", !message);
  }

  function showSection(section) {
    $("homeView").classList.toggle("hidden", section !== "home");
    $("portfolioSection").classList.toggle("hidden", section !== "portfolio");
    $("accountSection").classList.toggle("hidden", section !== "account");
    if (section === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      requestAnimationFrame(updateArtistPosition);
    }
  }

  function updateAuthControls() {
    const signedIn = Boolean(currentUser);
    $("userLoginButton").classList.toggle("hidden", signedIn);
    $("adminLoginButton").classList.toggle("hidden", signedIn);
    $("accountName").classList.toggle("hidden", !signedIn);
    $("logoutButton").classList.toggle("hidden", !signedIn);
    if (signedIn) {
      $("accountName").textContent = `${currentUser.name} · ${currentUser.role === "admin" ? "Admin" : "User"}`;
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

  function renderArtists() {
    $("artistGrid").innerHTML = artists.length ? artists.map((artist, index) => {
      const count = artworks.filter(item => item.artistId === artist.id).length;
      const color = artist.color || palette[index % palette.length];
      return `<button class="artist-card" data-artist="${escapeHTML(artist.id)}">
        <div class="artist-portrait" style="--portrait-color:${escapeHTML(color)}">
          ${artist.profileImage ? `<img class="artist-photo" src="${escapeHTML(artist.profileImage)}" alt="Portrait of ${escapeHTML(artist.name)}">` : `<span class="portrait-initial">${escapeHTML(artist.name.charAt(0))}</span>`}
          <div class="artist-meta"><div><strong>${escapeHTML(artist.name)}</strong><small>${escapeHTML(artist.medium || "Family artist")} · ${count} ${count === 1 ? "work" : "works"}</small><span class="artist-bio">${escapeHTML(artist.bio || "A member of the De Vera family.")}</span></div><span class="arrow">↗</span></div>
        </div>
      </button>`;
    }).join("") : `<div class="empty"><strong>No artists yet</strong>The gallery is ready for artist entries.</div>`;
    $("artistGrid").querySelectorAll("[data-artist]").forEach(card =>
      card.addEventListener("click", () => openPortfolio(card.dataset.artist)));
    $("artistGrid").scrollLeft = 0;
    activeArtistIndex = 0;
    updateArtistPosition();
  }

  function renderArtwork(item, artist) {
    const image = item.image
      ? `<img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.title)}">`
      : `<span class="art-abstract" style="background:${escapeHTML(item.color || "#b7c4a4")}"></span>`;
    return `<article class="art-card">
      <div class="art-image">${image}</div>
      <div class="art-info"><h3>${escapeHTML(item.title)}</h3>
        <p>${escapeHTML(artist.name)} · ${escapeHTML(item.medium || "Artwork")}</p>
        ${item.description ? `<p style="margin-top:8px;line-height:1.5">${escapeHTML(item.description)}</p>` : ""}
        <div class="art-footer"><span class="tag">${escapeHTML(item.medium || "Artwork")}</span></div>
      </div>
    </article>`;
  }

  async function loadGallery() {
    const [artistResult, artworkResult] = await Promise.all([
      supabaseClient.from("devera_portfolio_artists")
        .select("id,user_id,name,medium,bio,profile_image,profile_image_path")
        .order("created_at"),
      supabaseClient.from("devera_portfolio_artworks")
        .select("id,artist_id,owner_id,title,medium,description,image_url,image_path")
        .order("created_at")
    ]);
    if (artistResult.error) throw artistResult.error;
    if (artworkResult.error) throw artworkResult.error;
    artists.splice(0, artists.length, ...artistResult.data.map(artist => ({
      ...artist,
      profileImage: artist.profile_image
    })));
    artworks.splice(0, artworks.length, ...artworkResult.data.map(artwork => ({
      ...artwork,
      artistId: artwork.artist_id,
      image: artwork.image_url
    })));
    renderArtists();
    if (currentUser && currentUser.role === "admin") renderAdminLists();
  }

  function openPortfolio(artistId) {
    const artist = artists.find(item => item.id === artistId);
    if (!artist) return;
    $("portfolioTitle").textContent = artist.name;
    $("portfolioBio").textContent = [artist.medium, artist.bio].filter(Boolean).join(" · ") || "A member of the De Vera family.";
    const works = artworks.filter(item => item.artistId === artistId);
    $("portfolioGrid").innerHTML = works.length
      ? works.map(item => renderArtwork(item, artist)).join("")
      : `<div class="empty"><strong>Portfolio in progress</strong>This artist's work will appear here.</div>`;
    showSection("portfolio");
    $("portfolioSection").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderAdminLists() {
    if (!currentUser || currentUser.role !== "admin") return;
    $("artistList").innerHTML = artists.length ? artists.map(artist => `
      <div class="admin-item">
        <div class="admin-item-copy"><strong>${escapeHTML(artist.name)}</strong><small>${escapeHTML(artist.medium || "Family artist")}</small></div>
        <div class="admin-item-actions">
          <button type="button" class="button outline" data-edit-artist="${escapeHTML(artist.id)}">Edit</button>
          <button type="button" class="button dark" data-delete-artist="${escapeHTML(artist.id)}">Delete</button>
        </div>
      </div>`).join("") : `<p class="admin-empty">No artist profiles yet.</p>`;
    $("artworkList").innerHTML = artworks.length ? artworks.map(artwork => {
      const artist = artists.find(item => item.id === artwork.artist_id);
      return `<div class="admin-item">
        <div class="admin-item-copy"><strong>${escapeHTML(artwork.title)}</strong><small>${escapeHTML(artist ? artist.name : "Unknown artist")} · ${escapeHTML(artwork.medium || "Artwork")}</small></div>
        <div class="admin-item-actions">
          <button type="button" class="button outline" data-edit-artwork="${escapeHTML(artwork.id)}">Edit</button>
          <button type="button" class="button dark" data-delete-artwork="${escapeHTML(artwork.id)}">Delete</button>
        </div>
      </div>`;
    }).join("") : `<p class="admin-empty">No artworks yet.</p>`;
    $("artworkArtist").innerHTML = artists.length
      ? artists.map(artist => `<option value="${escapeHTML(artist.id)}">${escapeHTML(artist.name)}</option>`).join("")
      : `<option value="">Add an artist first</option>`;
    $("artworkArtist").disabled = artists.length === 0;
    $("artworkSave").disabled = artists.length === 0;
  }

  function renderMemberArtworks() {
    $("memberArtworkList").innerHTML = memberArtworks.length ? memberArtworks.map(artwork => `
      <div class="admin-item">
        <div class="admin-item-copy artwork-owner-copy">
          ${artwork.image_url ? `<img class="artwork-owner-image" src="${escapeHTML(artwork.image_url)}" alt="">` : ""}
          <strong>${escapeHTML(artwork.title)}</strong>
          <small>${escapeHTML(artwork.medium || "Artwork")}</small>
        </div>
        <div class="admin-item-actions">
          <button type="button" class="button outline" data-edit-member-artwork="${escapeHTML(artwork.id)}">Edit</button>
          <button type="button" class="button dark" data-delete-member-artwork="${escapeHTML(artwork.id)}">Delete</button>
        </div>
      </div>`).join("") : `<p class="admin-empty">You have not uploaded any artwork yet.</p>`;
  }

  async function loadMemberArtworks() {
    const { data, error } = await supabaseClient.from("devera_portfolio_artworks")
      .select("id,artist_id,owner_id,title,medium,description,image_url,image_path")
      .eq("owner_id", currentUser.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    memberArtworks = data;
    renderMemberArtworks();
  }

  function validateImageFile(file) {
    if (!file) return;
    if (!allowedImageTypes.includes(file.type)) {
      throw new Error("Choose a JPEG, PNG, or WebP image.");
    }
    if (file.size > maxImageBytes) {
      throw new Error("Images must be 5 MB or smaller.");
    }
  }

  async function uploadMemberImage(file, category) {
    validateImageFile(file);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "photo";
    const path = `${currentUser.id}/${category}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName}`;
    const { error } = await supabaseClient.storage.from(imageBucket)
      .upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: false });
    if (error) throw error;
    const { data } = supabaseClient.storage.from(imageBucket).getPublicUrl(path);
    return { path, url: data.publicUrl };
  }

  async function removeMemberImage(path) {
    if (!path) return;
    const { error } = await supabaseClient.storage.from(imageBucket).remove([path]);
    if (error) throw error;
  }

  async function loadAdminUsers() {
    const { data, error } = await supabaseClient.from("profiles")
      .select("id,email,display_name,role")
      .order("created_at");
    if (error) throw error;
    $("userList").innerHTML = data.length ? data.map(profile => `
      <div class="admin-item">
        <div class="admin-item-copy">
          <strong>${escapeHTML(profile.display_name || "Gallery member")}</strong>
          <small>${escapeHTML(profile.email || "Email unavailable")} · ${profile.role === "admin" ? "Admin" : "User"}</small>
        </div>
        <div class="admin-item-actions">
          ${profile.id === currentUser.id
            ? `<span class="admin-help">You</span>`
            : `<button type="button" class="button outline" data-user-id="${escapeHTML(profile.id)}" data-user-role="${escapeHTML(profile.role)}">${profile.role === "admin" ? "Make user" : "Make admin"}</button>`}
        </div>
      </div>`).join("") : `<p class="admin-empty">No user profiles found.</p>`;
  }

  async function saveArtist(event) {
    event.preventDefault();
    if (!currentUser || currentUser.role !== "admin") return;
    const id = $("artistId").value;
    const image = $("artistImage").value.trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(image) && !/^https?:\/\//i.test(image)) {
      setAdminNotice("Use an HTTPS image address or a relative file path.");
      return;
    }
    const values = {
      name: $("artistName").value.trim(),
      medium: $("artistMedium").value.trim() || "Family artist",
      bio: $("artistBio").value.trim(),
      profile_image: image
    };
    $("artistSave").disabled = true;
    setAdminNotice("");
    try {
      const result = id
        ? await supabaseClient.from("devera_portfolio_artists").update(values).eq("id", id)
        : await supabaseClient.from("devera_portfolio_artists").insert(values);
      if (result.error) throw result.error;
      $("artistForm").reset();
      $("artistId").value = "";
      $("artistCancel").classList.add("hidden");
      $("artistSave").textContent = "Save artist";
      await loadGallery();
      setAdminNotice("Artist saved.");
    } catch (error) {
      console.error(error);
      setAdminNotice(error.message || "Could not save this artist.");
    } finally {
      $("artistSave").disabled = false;
    }
  }

  async function saveArtwork(event) {
    event.preventDefault();
    if (!currentUser || currentUser.role !== "admin") return;
    const id = $("artworkId").value;
    const image = $("artworkImage").value.trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(image) && !/^https?:\/\//i.test(image)) {
      setAdminNotice("Use an HTTPS image address or a relative file path.");
      return;
    }
    const values = {
      artist_id: $("artworkArtist").value,
      title: $("artworkTitle").value.trim(),
      medium: $("artworkMedium").value.trim() || "Artwork",
      description: $("artworkDescription").value.trim(),
      image_url: image
    };
    $("artworkSave").disabled = true;
    setAdminNotice("");
    try {
      const result = id
        ? await supabaseClient.from("devera_portfolio_artworks").update(values).eq("id", id)
        : await supabaseClient.from("devera_portfolio_artworks").insert(values);
      if (result.error) throw result.error;
      $("artworkForm").reset();
      $("artworkId").value = "";
      $("artworkCancel").classList.add("hidden");
      $("artworkSave").textContent = "Save artwork";
      renderAdminLists();
      await loadGallery();
      setAdminNotice("Artwork saved.");
    } catch (error) {
      console.error(error);
      setAdminNotice(error.message || "Could not save this artwork.");
    } finally {
      $("artworkSave").disabled = artists.length === 0;
    }
  }

  function startArtistEdit(id) {
    const artist = artists.find(item => item.id === id);
    if (!artist) return;
    $("artistId").value = artist.id;
    $("artistName").value = artist.name;
    $("artistMedium").value = artist.medium || "";
    $("artistBio").value = artist.bio || "";
    $("artistImage").value = artist.profile_image || "";
    $("artistCancel").classList.remove("hidden");
    $("artistSave").textContent = "Update artist";
    $("artistName").focus();
  }

  function startArtworkEdit(id) {
    const artwork = artworks.find(item => item.id === id);
    if (!artwork) return;
    $("artworkId").value = artwork.id;
    $("artworkArtist").value = artwork.artist_id;
    $("artworkTitle").value = artwork.title;
    $("artworkMedium").value = artwork.medium || "";
    $("artworkDescription").value = artwork.description || "";
    $("artworkImage").value = artwork.image_url || "";
    $("artworkCancel").classList.remove("hidden");
    $("artworkSave").textContent = "Update artwork";
    $("artworkTitle").focus();
  }

  async function handleAdminAction(event) {
    const button = event.target.closest("button");
    if (!button || !currentUser || currentUser.role !== "admin") return;
    const artistId = button.dataset.editArtist;
    const artworkId = button.dataset.editArtwork;
    const deleteArtistId = button.dataset.deleteArtist;
    const deleteArtworkId = button.dataset.deleteArtwork;
    const userId = button.dataset.userId;
    if (artistId) {
      startArtistEdit(artistId);
      return;
    }
    if (artworkId) {
      startArtworkEdit(artworkId);
      return;
    }
    if (deleteArtistId) {
      const artist = artists.find(item => item.id === deleteArtistId);
      if (!artist || !window.confirm(`Delete ${artist.name} and all of their artworks?`)) return;
      try {
        const { error } = await supabaseClient.from("devera_portfolio_artists").delete().eq("id", deleteArtistId);
        if (error) throw error;
        await loadGallery();
        setAdminNotice("Artist and their artworks deleted.");
      } catch (error) {
        console.error(error);
        setAdminNotice(error.message || "Could not delete this artist.");
      }
      return;
    }
    if (deleteArtworkId) {
      const artwork = artworks.find(item => item.id === deleteArtworkId);
      if (!artwork || !window.confirm(`Delete artwork "${artwork.title}"?`)) return;
      try {
        const { error } = await supabaseClient.from("devera_portfolio_artworks").delete().eq("id", deleteArtworkId);
        if (error) throw error;
        await loadGallery();
        setAdminNotice("Artwork deleted.");
      } catch (error) {
        console.error(error);
        setAdminNotice(error.message || "Could not delete this artwork.");
      }
      return;
    }
    if (userId) {
      if (userId === currentUser.id) return;
      const nextRole = button.dataset.userRole === "admin" ? "artist" : "admin";
      button.disabled = true;
      try {
        const { error } = await supabaseClient.from("profiles")
          .update({ role: nextRole })
          .eq("id", userId);
        if (error) throw error;
        await loadAdminUsers();
        setAdminNotice(`Account role changed to ${nextRole === "admin" ? "admin" : "user"}.`);
      } catch (error) {
        console.error(error);
        setAdminNotice(error.message || "Could not change this account's role.");
      }
    }
  }

  async function loadAdminData() {
    setAdminNotice("");
    renderAdminLists();
    await loadAdminUsers();
  }

  async function saveMemberProfile(event) {
    event.preventDefault();
    if (!currentUser) return;
    const photo = $("memberProfilePhoto").files[0] || null;
    let uploadedImage = null;
    const oldImagePath = currentUser.profileImagePath;
    $("memberProfileSave").disabled = true;
    setMemberNotice("");
    try {
      if (photo) uploadedImage = await uploadMemberImage(photo, "profile");
      const values = {
        name: $("memberProfileName").value.trim(),
        medium: $("memberProfileMedium").value.trim() || "Family artist",
        bio: $("memberProfileBio").value.trim()
      };
      if (uploadedImage) {
        values.profile_image = uploadedImage.url;
        values.profile_image_path = uploadedImage.path;
      }
      const { data, error } = await supabaseClient.from("devera_portfolio_artists")
        .update(values)
        .eq("user_id", currentUser.id)
        .select("id,user_id,name,medium,bio,profile_image,profile_image_path")
        .single();
      if (error) throw error;
      currentUser.artistId = data.id;
      currentUser.name = data.name;
      currentUser.medium = data.medium;
      currentUser.bio = data.bio;
      currentUser.profileImage = data.profile_image;
      currentUser.profileImagePath = data.profile_image_path;
      $("accountDetails").textContent = `${currentUser.name} · ${currentUser.email}`;
      $("accountAvatar").src = currentUser.profileImage || "default-profile.jfif";
      $("accountAvatar").alt = `${currentUser.name}'s profile picture`;
      updateAuthControls();
      $("memberProfilePhoto").value = "";
      if (profilePreviewUrl) URL.revokeObjectURL(profilePreviewUrl);
      profilePreviewUrl = "";
      $("memberProfilePreview").src = currentUser.profileImage || "default-profile.jfif";
      let warning = "";
      if (uploadedImage && oldImagePath) {
        try {
          await removeMemberImage(oldImagePath);
        } catch (error) {
          console.error(error);
          warning = "Profile saved, but the previous photo could not be removed.";
        }
      }
      try {
        await loadGallery();
      } catch (error) {
        console.error(error);
        warning = "Profile saved, but the public gallery could not be refreshed.";
      }
      setMemberNotice(warning || "Your profile was saved.");
    } catch (error) {
      console.error(error);
      if (uploadedImage) {
        try {
          await removeMemberImage(uploadedImage.path);
        } catch (cleanupError) {
          console.error(cleanupError);
        }
      }
      setMemberNotice(error.message || "Could not save your profile.");
    } finally {
      $("memberProfileSave").disabled = false;
    }
  }

  async function saveMemberArtwork(event) {
    event.preventDefault();
    if (!currentUser) return;
    const artworkId = $("memberArtworkId").value;
    const existing = memberArtworks.find(artwork => artwork.id === artworkId);
    const photo = $("memberArtworkPhoto").files[0] || null;
    let uploadedImage = null;
    let saved = false;
    $("memberArtworkSave").disabled = true;
    setMemberNotice("");
    try {
      if (!existing && !photo) throw new Error("Choose a photo for this artwork.");
      if (photo) uploadedImage = await uploadMemberImage(photo, "artwork");
      const values = {
        artist_id: currentUser.artistId,
        owner_id: currentUser.id,
        title: $("memberArtworkTitle").value.trim(),
        medium: $("memberArtworkMedium").value.trim() || "Artwork",
        description: $("memberArtworkDescription").value.trim(),
        image_url: uploadedImage ? uploadedImage.url : existing.image_url,
        image_path: uploadedImage ? uploadedImage.path : existing.image_path
      };
      const result = existing
        ? await supabaseClient.from("devera_portfolio_artworks")
          .update(values).eq("id", existing.id).eq("owner_id", currentUser.id)
        : await supabaseClient.from("devera_portfolio_artworks").insert(values);
      if (result.error) throw result.error;
      saved = true;
      $("memberArtworkForm").reset();
      $("memberArtworkId").value = "";
      $("memberArtworkCancel").classList.add("hidden");
      $("memberArtworkSave").textContent = "Save artwork";
      let warning = "";
      if (uploadedImage && existing && existing.image_path) {
        try {
          await removeMemberImage(existing.image_path);
        } catch (error) {
          console.error(error);
          warning = "Artwork saved, but the previous photo could not be removed.";
        }
      }
      try {
        await Promise.all([loadMemberArtworks(), loadGallery()]);
      } catch (error) {
        console.error(error);
        warning = "Artwork saved, but the gallery could not be refreshed.";
      }
      setMemberNotice(warning || "Your artwork was saved and is now public.");
    } catch (error) {
      console.error(error);
      if (uploadedImage && !saved) {
        try {
          await removeMemberImage(uploadedImage.path);
        } catch (cleanupError) {
          console.error(cleanupError);
        }
      }
      setMemberNotice(error.message || "Could not save this artwork.");
    } finally {
      $("memberArtworkSave").disabled = false;
    }
  }

  function startMemberArtworkEdit(id) {
    const artwork = memberArtworks.find(item => item.id === id);
    if (!artwork) return;
    $("memberArtworkId").value = artwork.id;
    $("memberArtworkTitle").value = artwork.title;
    $("memberArtworkMedium").value = artwork.medium || "";
    $("memberArtworkDescription").value = artwork.description || "";
    $("memberArtworkPhoto").value = "";
    $("memberArtworkCancel").classList.remove("hidden");
    $("memberArtworkSave").textContent = "Update artwork";
    $("memberArtworkTitle").focus();
  }

  async function handleMemberAction(event) {
    const button = event.target.closest("button");
    if (!button || !currentUser) return;
    const editId = button.dataset.editMemberArtwork;
    if (editId) {
      startMemberArtworkEdit(editId);
      return;
    }
    const deleteId = button.dataset.deleteMemberArtwork;
    if (!deleteId) return;
    const artwork = memberArtworks.find(item => item.id === deleteId);
    if (!artwork || !window.confirm(`Delete "${artwork.title}"?`)) return;
    try {
      const { error } = await supabaseClient.from("devera_portfolio_artworks")
        .delete().eq("id", artwork.id).eq("owner_id", currentUser.id);
      if (error) throw error;
      let warning = "";
      if (artwork.image_path) {
        try {
          await removeMemberImage(artwork.image_path);
        } catch (error) {
          console.error(error);
          warning = "Artwork deleted, but its photo could not be removed.";
        }
      }
      await Promise.all([loadMemberArtworks(), loadGallery()]);
      setMemberNotice(warning || "Artwork deleted.");
    } catch (error) {
      console.error(error);
      setMemberNotice(error.message || "Could not delete this artwork.");
    }
  }

  async function loadAccount(authUser) {
    if (!authUser) {
      currentUser = null;
      $("adminTools").classList.add("hidden");
      $("memberTools").classList.add("hidden");
      updateAuthControls();
      if (!$("accountSection").classList.contains("hidden")) showSection("home");
      return;
    }
    const { data, error } = await supabaseClient.from("profiles")
      .select("id,display_name,role,profile_image")
      .eq("id", authUser.id)
      .single();
    if (error) throw error;
    const { data: artistData, error: artistError } = await supabaseClient.from("devera_portfolio_artists")
      .select("id,user_id,name,medium,bio,profile_image,profile_image_path")
      .eq("user_id", authUser.id)
      .maybeSingle();
    if (artistError) throw artistError;
    let artist = artistData;
    if (!artist) {
      const { data: createdArtist, error: createArtistError } = await supabaseClient.from("devera_portfolio_artists")
        .insert({
          user_id: authUser.id,
          name: data.display_name || authUser.email || "Family Artist",
          profile_image: data.profile_image || "default-profile.jfif"
        })
        .select("id,user_id,name,medium,bio,profile_image,profile_image_path")
        .single();
      if (createArtistError) throw createArtistError;
      artist = createdArtist;
    }
    currentUser = {
      id: data.id,
      email: authUser.email || "",
      name: artist.name,
      role: data.role,
      artistId: artist.id,
      medium: artist.medium,
      bio: artist.bio,
      profileImage: artist.profile_image,
      profileImagePath: artist.profile_image_path
    };
    $("accountEyebrow").textContent = currentUser.role === "admin" ? "Administrator access" : "User account";
    $("accountTitle").textContent = currentUser.role === "admin" ? "Admin dashboard" : "Welcome";
    $("accountMessage").textContent = currentUser.role === "admin"
      ? "You are signed in with administrator access."
      : "You are signed in with a user account.";
    $("accountDetails").textContent = `${currentUser.name} · ${currentUser.email}`;
    $("accountAvatar").src = currentUser.profileImage || "default-profile.jfif";
    $("accountAvatar").alt = `${currentUser.name}'s profile picture`;
    $("memberProfileName").value = currentUser.name;
    $("memberProfileMedium").value = currentUser.medium || "";
    $("memberProfileBio").value = currentUser.bio || "";
    $("memberProfilePreview").src = currentUser.profileImage || "default-profile.jfif";
    $("memberTools").classList.remove("hidden");
    $("adminTools").classList.toggle("hidden", currentUser.role !== "admin");
    updateAuthControls();
    setNotice("");
    setMemberNotice("");
    showSection("account");
    await loadMemberArtworks();
    if (currentUser.role === "admin") {
      try {
        await loadAdminData();
      } catch (error) {
        console.error(error);
        setAdminNotice(`Could not load admin tools: ${error.message}`);
      }
    }
  }

  function openAuth(mode) {
    authMode = mode;
    const isSignup = mode === "signup";
    const isAdmin = mode === "admin";
    $("authTitle").textContent = isSignup ? "Create user account" : isAdmin ? "Admin login" : "User login";
    $("authIntro").textContent = isSignup
      ? "Create an account to sign in to the gallery."
      : isAdmin
        ? "Sign in with an administrator account."
        : "Sign in with your user account.";
    $("nameField").classList.toggle("hidden", !isSignup);
    $("authName").required = isSignup;
    $("authPassword").autocomplete = isSignup ? "new-password" : "current-password";
    $("authSubmit").textContent = isSignup ? "Create account" : "Sign in";
    $("authSwitch").classList.toggle("hidden", isAdmin);
    $("authSwitch").textContent = isSignup ? "Already have an account? Sign in" : "Create a user account";
    $("authError").textContent = configured ? "" : "Account access is not configured. Follow the setup instructions in README.md.";
    $("authSubmit").disabled = !configured;
    $("authForm").reset();
    $("authBackdrop").classList.remove("hidden");
    $("authEmail").focus();
  }

  function closeAuth() {
    $("authBackdrop").classList.add("hidden");
  }

  async function submitAuth(event) {
    event.preventDefault();
    if (!supabaseClient) return;
    $("authError").textContent = "";
    $("authSubmit").disabled = true;
    const email = $("authEmail").value.trim().toLowerCase();
    const password = $("authPassword").value;
    try {
      if (authMode === "signup") {
        const name = $("authName").value.trim();
        if (!name) throw new Error("Please enter your name.");
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: { data: { display_name: name, profile_image: "default-profile.jfif" } }
        });
        if (error) throw error;
        if (!data.session) {
          $("authError").textContent = "Check your email to confirm your account, then sign in.";
          return;
        }
        await loadAccount(data.user);
      } else {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const profileResult = await supabaseClient.from("profiles")
          .select("role")
          .eq("id", data.user.id)
          .single();
        if (profileResult.error) throw profileResult.error;
        const expectedRole = authMode === "admin" ? "admin" : "artist";
        if (profileResult.data.role !== expectedRole) {
          await supabaseClient.auth.signOut();
          throw new Error(authMode === "admin"
            ? "This account does not have administrator access."
            : "This is an administrator account. Use Admin login.");
        }
        await loadAccount(data.user);
      }
      closeAuth();
    } catch (error) {
      console.error(error);
      $("authError").textContent = error.message || "Sign-in failed. Please try again.";
    } finally {
      $("authSubmit").disabled = !configured;
    }
  }

  async function signOut() {
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error(error);
      setNotice(error.message || "Sign out failed. Please try again.");
    }
  }

  function initialize() {
    $("year").textContent = new Date().getFullYear();
    updateAuthControls();
    if (!configured) {
      setNotice("Account access is not configured. Follow the setup instructions in README.md.");
      return;
    }
    if (!window.supabase || !window.supabase.createClient) {
      setNotice("The account service could not load. Check your internet connection and reload.");
      return;
    }
    supabaseClient = window.supabase.createClient(supabaseUrl, config.anonKey);
    loadGallery().catch(error => {
      console.error(error);
      setNotice(["PGRST205", "42703", "PGRST204"].includes(error.code)
        ? "The gallery database needs the updated setup. Run the latest supabase/setup.sql in Supabase SQL Editor."
        : `Could not load the gallery: ${error.message}`);
    });
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (["SIGNED_OUT", "SIGNED_IN", "INITIAL_SESSION", "TOKEN_REFRESHED"].includes(event)) {
        setTimeout(() => loadAccount(session && session.user).catch(error => {
          console.error(error);
          setNotice(`Could not load the account profile: ${error.message}`);
        }), 0);
      }
    });
  }

  $("homeLink").addEventListener("click", event => {
    event.preventDefault();
    showSection("home");
  });
  $("artistsLink").addEventListener("click", event => {
    event.preventDefault();
    showSection("home");
  });
  $("backHomeButton").addEventListener("click", () => showSection("home"));
  $("previousArtist").addEventListener("click", () => moveArtist(-1));
  $("nextArtist").addEventListener("click", () => moveArtist(1));
  $("artistGrid").addEventListener("scroll", updateArtistPosition, { passive: true });
  $("userLoginButton").addEventListener("click", () => openAuth("user"));
  $("adminLoginButton").addEventListener("click", () => openAuth("admin"));
  $("logoutButton").addEventListener("click", signOut);
  $("authSwitch").addEventListener("click", () => openAuth(authMode === "signup" ? "user" : "signup"));
  $("authForm").addEventListener("submit", submitAuth);
  $("memberProfileForm").addEventListener("submit", saveMemberProfile);
  $("memberArtworkForm").addEventListener("submit", saveMemberArtwork);
  $("memberTools").addEventListener("click", event => { handleMemberAction(event); });
  $("memberArtworkCancel").addEventListener("click", () => {
    $("memberArtworkForm").reset();
    $("memberArtworkId").value = "";
    $("memberArtworkCancel").classList.add("hidden");
    $("memberArtworkSave").textContent = "Save artwork";
  });
  $("memberProfilePhoto").addEventListener("change", () => {
    const file = $("memberProfilePhoto").files[0];
    if (!file) return;
    if (profilePreviewUrl) URL.revokeObjectURL(profilePreviewUrl);
    profilePreviewUrl = URL.createObjectURL(file);
    $("memberProfilePreview").src = profilePreviewUrl;
  });
  $("artistForm").addEventListener("submit", saveArtist);
  $("artworkForm").addEventListener("submit", saveArtwork);
  $("adminTools").addEventListener("click", event => { handleAdminAction(event); });
  $("artistCancel").addEventListener("click", () => {
    $("artistForm").reset();
    $("artistId").value = "";
    $("artistCancel").classList.add("hidden");
    $("artistSave").textContent = "Save artist";
  });
  $("artworkCancel").addEventListener("click", () => {
    $("artworkForm").reset();
    $("artworkId").value = "";
    $("artworkCancel").classList.add("hidden");
    $("artworkSave").textContent = "Save artwork";
  });
  $("closeAuth").addEventListener("click", closeAuth);
  $("authBackdrop").addEventListener("click", event => {
    if (event.target === $("authBackdrop")) closeAuth();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeAuth();
  });
  window.addEventListener("resize", updateArtistPosition);

  renderArtists();
  showSection("home");
  initialize();
}());
