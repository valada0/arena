(() => {
  const PROJECT_URL = "https://sfqbcyjwmymimxhijlut.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_SkhHXsXvyjPSFowFtmZ-6w_pJVw_hiS";
  const LEGACY_KEY = "meu-campeonato-v1";
  const client = window.supabase.createClient(PROJECT_URL, PUBLISHABLE_KEY);
  const authEvents = new EventTarget();
  let currentUser = null;
  let championships = [];
  let readyResolve;
  let initialized = false;
  const ready = new Promise((resolve) => { readyResolve = resolve; });

  const authContainer = document.createElement("div");
  authContainer.className = "auth-area";
  authContainer.innerHTML = `
    <button class="botao botao-auth" id="abrirAuth" type="button">Entrar</button>
    <div class="auth-logado" id="authLogado" hidden>
      <span id="emailAuth"></span>
      <button class="botao-sair" id="sairAuth" type="button">Sair</button>
    </div>
  `;
  document.querySelector(".topo").append(authContainer);

  const modalAuth = document.createElement("dialog");
  modalAuth.className = "modal-placar modal-auth";
  modalAuth.innerHTML = `
    <form class="painel-modal" id="formAuth">
      <div class="cabecalho-modal">
        <div><span class="etiqueta-modal">ARENA+ NA NUVEM</span><h2>Acesse sua conta</h2></div>
        <button type="button" class="fechar-modal" id="fecharAuth" aria-label="Fechar">×</button>
      </div>
      <p class="mensagem-info">Entre para salvar e acessar seus campeonatos em qualquer dispositivo.</p>
      <label class="campo-edicao" for="emailAuthInput">E-mail
        <input id="emailAuthInput" type="email" autocomplete="email" required>
      </label>
      <label class="campo-edicao" for="senhaAuthInput">Senha
        <input id="senhaAuthInput" type="password" autocomplete="current-password" minlength="6" required>
      </label>
      <p class="auth-mensagem" id="mensagemAuth" role="status" aria-live="polite"></p>
      <div class="acoes-modal">
        <button type="button" class="aba" id="criarContaAuth">Criar conta</button>
        <button type="submit" class="botao" id="entrarAuth">Entrar</button>
      </div>
    </form>
  `;
  document.body.append(modalAuth);

  function dispararDadosCarregados(error = null) {
    authEvents.dispatchEvent(new CustomEvent("data", {
      detail: { user: currentUser, championships: [...championships], error }
    }));
  }

  function lerCampeonatosLegados() {
    try {
      const data = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error("Não foi possível ler os campeonatos locais anteriores.", error);
      return [];
    }
  }

  async function importarDadosLegados() {
    if (!currentUser) return;
    const existentes = new Set(championships.map((item) => String(item.id)));
    const antigos = lerCampeonatosLegados()
      .filter((item) => !existentes.has(String(item.id)));
    if (!antigos.length) return;
    const importar = confirm(
      `Encontramos ${antigos.length} campeonato(s) ainda não importados neste navegador. ` +
      `Deseja importá-los para a conta ${currentUser.email}?`
    );
    if (!importar) return;
    const rows = antigos.map((data) => ({
      id: String(data.id),
      user_id: currentUser.id,
      data,
      updated_at: new Date().toISOString()
    }));
    const { error } = await client.from("championships").upsert(rows);
    if (error) throw error;
    championships = [...antigos, ...championships];
  }

  async function carregarCampeonatos() {
    const { data, error } = await client
      .from("championships")
      .select("id,user_id,data")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    championships = (data || []).map((row) => ({
      ...row.data,
      ownerId: row.user_id
    }));
    if (currentUser) await importarDadosLegados();
    dispararDadosCarregados();
  }

  function atualizarInterfaceAuth() {
    const abrir = authContainer.querySelector("#abrirAuth");
    const logado = authContainer.querySelector("#authLogado");
    abrir.hidden = Boolean(currentUser);
    logado.hidden = !currentUser;
    authContainer.querySelector("#emailAuth").textContent = currentUser ? currentUser.email : "";
  }

  async function sincronizarSessao(session) {
    currentUser = session && session.user ? session.user : null;
    atualizarInterfaceAuth();
    try {
      await carregarCampeonatos();
      if (!initialized) {
        initialized = true;
        readyResolve();
      }
    } catch (error) {
      championships = [];
      dispararDadosCarregados(error);
      if (!initialized) {
        initialized = true;
        readyResolve();
      }
      mostrarErro(error);
    }
  }

  function mostrarErro(error) {
    const mensagem = error && error.message ? error.message : String(error);
    authContainer.dataset.error = mensagem;
    console.error("Erro ao sincronizar com Supabase:", error);
    alert("Não foi possível sincronizar com o Supabase. " + mensagem);
  }

  async function salvarCampeonato(data) {
    if (!currentUser) throw new Error("Entre na sua conta para salvar campeonatos.");
    if (data.ownerId && data.ownerId !== currentUser.id) {
      throw new Error("Somente o organizador pode editar este campeonato.");
    }
    const championshipData = { ...data };
    delete championshipData.ownerId;
    const { error } = await client.from("championships").upsert({
      id: String(data.id),
      user_id: currentUser.id,
      data: championshipData,
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
    const index = championships.findIndex((item) => item.id === data.id);
    const savedChampionship = { ...championshipData, ownerId: currentUser.id };
    if (index < 0) championships.unshift(savedChampionship);
    else championships[index] = savedChampionship;
  }

  async function excluirCampeonato(id) {
    if (!currentUser) throw new Error("Entre na sua conta para excluir campeonatos.");
    const { error } = await client.from("championships").delete()
      .eq("id", String(id)).eq("user_id", currentUser.id);
    if (error) throw error;
    championships = championships.filter((item) => String(item.id) !== String(id));
    dispararDadosCarregados();
  }

  async function entrar(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await sincronizarSessao(data.session);
    return data;
  }

  async function criarConta(email, password) {
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;
    if (data.session) await sincronizarSessao(data.session);
    return data;
  }

  async function sair() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
    await sincronizarSessao(null);
  }

  async function listarInscricoes(championshipId) {
    const { data, error } = await client
      .from("championship_registrations")
      .select("id,user_id,team_name,player_one,player_two,created_at")
      .eq("championship_id", String(championshipId))
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function inscrever(championshipId, teamName, playerOne, playerTwo) {
    if (!currentUser) throw new Error("Entre na sua conta para se inscrever.");
    const { error } = await client.from("championship_registrations").insert({
      championship_id: String(championshipId),
      user_id: currentUser.id,
      team_name: teamName,
      player_one: playerOne,
      player_two: playerTwo
    });
    if (error) throw error;
  }

  async function removerInscricao(registrationId) {
    if (!currentUser) throw new Error("Entre na sua conta para alterar inscrições.");
    const { error } = await client.from("championship_registrations")
      .delete().eq("id", String(registrationId));
    if (error) throw error;
  }

  authContainer.querySelector("#abrirAuth").addEventListener("click", () => {
    modalAuth.querySelector("#mensagemAuth").textContent = "";
    modalAuth.showModal();
  });
  modalAuth.querySelector("#fecharAuth").addEventListener("click", () => modalAuth.close());
  modalAuth.querySelector("#formAuth").addEventListener("submit", async (event) => {
    event.preventDefault();
    const mensagem = modalAuth.querySelector("#mensagemAuth");
    const submit = modalAuth.querySelector("#entrarAuth");
    submit.disabled = true;
    mensagem.textContent = "Conectando...";
    try {
      await entrar(
        modalAuth.querySelector("#emailAuthInput").value.trim(),
        modalAuth.querySelector("#senhaAuthInput").value
      );
      modalAuth.close();
    } catch (error) {
      mensagem.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
  modalAuth.querySelector("#criarContaAuth").addEventListener("click", async () => {
    const mensagem = modalAuth.querySelector("#mensagemAuth");
    const button = modalAuth.querySelector("#criarContaAuth");
    button.disabled = true;
    mensagem.textContent = "Criando conta...";
    try {
      const data = await criarConta(
        modalAuth.querySelector("#emailAuthInput").value.trim(),
        modalAuth.querySelector("#senhaAuthInput").value
      );
      mensagem.textContent = data.session
        ? "Conta criada e conectada."
        : "Conta criada. Confirme seu e-mail antes de entrar.";
    } catch (error) {
      mensagem.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  authContainer.querySelector("#sairAuth").addEventListener("click", async () => {
    try {
      await sair();
    } catch (error) {
      mostrarErro(error);
    }
  });

  client.auth.onAuthStateChange((_event, session) => {
    if (!initialized) return;
    setTimeout(() => { void sincronizarSessao(session); }, 0);
  });

  const store = {
    client,
    ready,
    get user() { return currentUser; },
    get championships() { return [...championships]; },
    onData(callback) {
      const listener = (event) => callback(event.detail);
      authEvents.addEventListener("data", listener);
      return () => authEvents.removeEventListener("data", listener);
    },
    save: salvarCampeonato,
    remove: excluirCampeonato,
    listRegistrations: listarInscricoes,
    register: inscrever,
    removeRegistration: removerInscricao,
    openAuth() {
      modalAuth.querySelector("#mensagemAuth").textContent = "";
      modalAuth.showModal();
    },
    showError: mostrarErro
  };
  window.arenaStore = store;

  client.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    return sincronizarSessao(data.session);
  }).catch((error) => {
    mostrarErro(error);
    if (!initialized) {
      initialized = true;
      readyResolve();
    }
  });
})();
