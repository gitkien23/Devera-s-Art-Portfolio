(function () {
  "use strict";

  const config = window.SUPABASE_CONFIG || {};
  const supabaseUrl = String(config.url || "").replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
  const configured = Boolean(supabaseUrl && config.anonKey &&
    !supabaseUrl.includes("YOUR_") && !config.anonKey.includes("YOUR_"));
  const artists = [];
  const artworks = [];
  const palette = ["#9f775e", "#829078", "#9d8caf", "#c18a68", "#718995", "#b08e50"];
  let supabaseClient = null;
  let currentUser = null;
  let activeArtistIndex = 0;
  let authMode = "user";

  const $ = id => document.getElementById(id);
  const escapeHTML = value => String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));

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

  async function loadAccount(authUser) {
    if (!authUser) {
      currentUser = null;
      updateAuthControls();
      if (!$("accountSection").classList.contains("hidden")) showSection("home");
      return;
    }
    const { data, error } = await supabaseClient.from("profiles")
      .select("id,display_name,role,profile_image")
      .eq("id", authUser.id)
      .single();
    if (error) throw error;
    currentUser = {
      id: data.id,
      email: authUser.email || "",
      name: data.display_name || authUser.email || "Gallery member",
      role: data.role
    };
    $("accountEyebrow").textContent = currentUser.role === "admin" ? "Administrator access" : "User account";
    $("accountTitle").textContent = currentUser.role === "admin" ? "Admin dashboard" : "Welcome";
    $("accountMessage").textContent = currentUser.role === "admin"
      ? "You are signed in with administrator access."
      : "You are signed in with a user account.";
    $("accountDetails").textContent = `${currentUser.name} · ${currentUser.email}`;
    $("accountAvatar").src = data.profile_image || "default-profile.jfif";
    $("accountAvatar").alt = `${currentUser.name}'s profile picture`;
    updateAuthControls();
    setNotice("");
    showSection("account");
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
