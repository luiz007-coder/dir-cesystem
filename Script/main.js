const SUPABASE_URL = 'https://adozejfhxwtbyuczvzyc.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkb3plamZoeHd0Ynl1Y3p2enljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5ODgwNzIsImV4cCI6MjA4NjU2NDA3Mn0.yXccuiEV1sjZKHVJ4q-TuEuHDOsn7ywrus8RlA-o628';

        let usuarioEncontrado = null;
        let avaliadosCount = 0;
        let currentPage = 1;
        let itemsPerPage = 3;
        let currentFilter = 'all';
        let usuariosOnline = new Set();
        let atividades = [];
        let notificacoes = [];
        let notificacoesNaoLidas = 0;
        let logs = [];
        let paginaBloqueada = { coleta: false, avMensal: false };
        let canalRealtime = null;
        let intervaloAtualizacao = null;
        const INTERVALO_ATUALIZACAO = 5000;

        const HORARIOS = [
            '00h a 01h', '01h a 02h', '02h a 03h', '03h a 04h', '04h a 05h', '05h a 06h',
            '06h a 07h', '07h a 08h', '08h a 09h', '09h a 10h', '10h a 11h', '11h a 12h',
            '12h a 13h', '13h a 14h', '14h a 15h', '15h a 16h', '16h a 17h', '17h a 18h',
            '18h a 19h', '19h a 20h', '20h a 21h', '21h a 22h', '22h a 23h', '23h a 00h'
        ];

        function getTurno(horario) {
            const hora = parseInt(horario.split('h')[0]);
            if (hora >= 0 && hora < 6) return 'madrugada';
            if (hora >= 6 && hora < 13) return 'manhã';
            if (hora >= 13 && hora < 18) return 'tarde';
            return 'noite';
        }

        function mostrarToast(titulo, mensagem, tipo = 'info') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = `toast ${tipo}`;
            
            let icone = 'ph-info';
            if (tipo === 'success') icone = 'ph-check-circle';
            else if (tipo === 'error') icone = 'ph-x-circle';
            else if (tipo === 'warning') icone = 'ph-warning';
            
            toast.innerHTML = `
                <i class="ph ${icone}"></i>
                <div class="toast-content">
                    <div class="toast-title">${titulo}</div>
                    <div class="toast-message">${mensagem}</div>
                </div>
                <div class="toast-close" onclick="this.parentElement.remove()">×</div>
            `;
            
            container.appendChild(toast);
            
            setTimeout(() => {
                if (toast.parentElement) toast.remove();
            }, 5000);
        }

        async function pegarUsername() {
            try {
                let resposta = await fetch("/forum");
                let html = await resposta.text();
                let regex = /_userdata\["username"\]\s*=\s*"([^"]+)"/;
                let match = html.match(regex);
                if (match && match[1]) return match[1];
            } catch (err) {
                console.error('Erro ao pegar username:', err);
            }
            return ',youiz';
        }

        async function verificarUsuario(nickname) {
            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/usuarios?nickname=eq.${nickname}&select=*`, {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
                const usuarios = await response.json();
                return usuarios && usuarios.length > 0 ? usuarios[0] : null;
            } catch (error) {
                console.error('Erro ao verificar usuário:', error);
                return null;
            }
        }

        function verificarPermissaoAdmin() {
            const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
            return usuario.cargo === 'Admin' || usuario.cargo === 'DEV';
        }

        function atualizarVisibilidadeAdmin() {
            const temPermissao = verificarPermissaoAdmin();
            const menuAdmin = document.getElementById('menu-admin');
            const drawerAdmin = document.getElementById('drawer-admin');
            if (menuAdmin) menuAdmin.style.display = temPermissao ? 'flex' : 'none';
            if (drawerAdmin) drawerAdmin.style.display = temPermissao ? 'flex' : 'none';
        }

        async function carregarLogs() {
            if (!verificarPermissaoAdmin()) return;
            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/logs_acoes?order=data.desc&limit=50`, {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
                const data = await response.json();
                logs = Array.isArray(data) ? data : [];
                
                const container = document.getElementById('log-container');
                if (!container) return;
                
                if (logs.length === 0) {
                    container.innerHTML = '<div class="log-item" style="color:#888; text-align:center;">Nenhum log encontrado.</div>';
                    return;
                }
                
                container.innerHTML = logs.map(l => `
                    <div class="log-item">
                        <span class="log-data">${new Date(l.data).toLocaleString('pt-BR')}</span>
                        <span class="log-tipo ${l.tipo || ''}">${l.tipo || 'sistema'}</span>
                        <strong>${l.responsavel || 'Sistema'}</strong> - ${l.acao || 'Ação sem descrição'}
                    </div>
                `).join('');
            } catch (error) {
                console.error('Erro ao carregar logs:', error);
                logs = [];
            }
        }

        async function registrarLog(tipo, acao, responsavel, detalhes = {}) {
            try {
                await fetch(`${SUPABASE_URL}/rest/v1/logs_acoes`, {
                    method: 'POST',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tipo, acao, responsavel, detalhes, data: new Date().toISOString() })
                });
                if (verificarPermissaoAdmin()) carregarLogs();
            } catch (error) {
                console.error('Erro ao registrar log:', error);
            }
        }

        async function carregarHorarios() {
            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/horarios_usuario?order=nickname.asc`, {
                    headers: { 
                        'apikey': SUPABASE_KEY, 
                        'Authorization': `Bearer ${SUPABASE_KEY}` 
                    }
                });
                
                const horarios = await response.json();
                const tbody = document.getElementById('coleta-table-body');
                if (!tbody) return;
                
                if (horarios.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #888; padding: 20px;">Nenhum horário registrado</td></tr>';
                    return;
                }
                
                tbody.innerHTML = horarios.map(h => {
                    const horariosArray = h.horarios || [];
                    const turnosArray = h.turnos || [];

                    const turnosFormatados = turnosArray.join(' / ');

                    const horariosFormatados = horariosArray.join(' / ');

                    const infoExtra = `<span style="color: #888; font-size: 10px; margin-left: 8px;">${horariosArray.length}h • ${turnosArray.length}t</span>`;
                    
                    return `
                        <tr>
                            <td><strong>${h.nickname}</strong> ${infoExtra}</td>
                            <td>${turnosFormatados || '-'}</td>
                            <td>${horariosFormatados || '-'}</td>
                        </tr>
                    `;
                }).join('');
                
            } catch (error) {
                console.error('Erro ao carregar horários:', error);
            }
        }

        async function consultarHorario() {
            const nick = document.getElementById('consultar-nickname')?.value;
            if (!nick) {
                mostrarToast('Erro', 'Digite um nickname', 'error');
                return;
            }
            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/horarios_usuario?nickname=eq.${nick}`, {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
                const horarios = await response.json();
                
                if (horarios.length > 0) {
                    const h = horarios[0];
                    const horariosArray = h.horarios || [];
                    const turnosArray = h.turnos || [];

                    const horariosPorTurno = {};
                    horariosArray.forEach(horario => {
                        const turno = getTurno(horario);
                        if (!horariosPorTurno[turno]) {
                            horariosPorTurno[turno] = [];
                        }
                        horariosPorTurno[turno].push(horario);
                    });
                    
                    const modal = document.createElement('div');
                    modal.style.cssText = `
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        background: #242424;
                        border-radius: 14px;
                        padding: 13px;
                        z-index: 10001;
                        box-shadow: 0 0 30px rgba(0,0,0,0.5);
                        min-width: 400px;
                        max-width: 500px;
                    `;
                    
                    const turnosList = Object.entries(horariosPorTurno).map(([turno, horariosDoTurno]) => {
                        const turnoClass = `turno-${turno}`;
                        const horariosStr = horariosDoTurno.join(' / ');
                        
                        return `
                            <div style="margin: 15px 0; padding: 10px; background: #1b1b1b; border-radius: 8px;">
                                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 10px;">
                                    <span class="turno-badge ${turnoClass}" style="font-size: 12px; padding: 4px 11px;">${turno.toUpperCase()}</span>
                                    <span style="color: #888; font-size: 11px;">${horariosDoTurno.length} horário(s)</span>
                                </div>
                                <div style="color: #fff; font-size: 12px;">
                                    ${horariosStr}
                                </div>
                            </div>
                        `;
                    }).join('');
                    
                    modal.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 15px;">
                            <div>
                                <h3 style="color: #85e300; margin: 0; font-size: 18px;">${nick}</h3>
                                <span style="color: #888; font-size: 12px;">Última atualização: ${new Date(h.data_atualizacao || h.data_registro).toLocaleString('pt-BR')}</span>
                            </div>
                            <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: #888; font-size: 24px; cursor: pointer;">×</button>
                        </div>
                        <div>
                            ${turnosList}
                        </div>
                        <div style="margin-top: 20px; text-align: center; padding-top: 15px; border-top: 1px solid #333; background: #1b1b1b; border-radius: 8px; padding: 15px;">
                            <div style="display: flex; justify-content: space-around; align-items: center;">
                                <div>
                                    <span style="color: #85e300; font-size: 24px; font-weight: 700;">${horariosArray.length}</span>
                                    <span style="color: #ccc; font-size: 12px; display: block;">Horários</span>
                                </div>
                                <div style="width: 1px; height: 30px; background: #333;"></div>
                                <div>
                                    <span style="color: #85e300; font-size: 24px; font-weight: 700;">${turnosArray.length}</span>
                                    <span style="color: #ccc; font-size: 12px; display: block;">Turnos</span>
                                </div>
                                <div style="width: 1px; height: 30px; background: #333;"></div>
                                <div>
                                    <span style="color: #85e300; font-size: 14px; font-weight: 600;">${turnosArray.join(' / ')}</span>
                                    <span style="color: #ccc; font-size: 12px; display: block;">Turnos</span>
                                </div>
                            </div>
                        </div>
                    `;
                    
                    document.body.appendChild(modal);

                    setTimeout(() => {
                        document.addEventListener('click', function fechar(e) {
                            if (!modal.contains(e.target)) {
                                modal.remove();
                                document.removeEventListener('click', fechar);
                            }
                        });
                    }, 100);
                    
                } else {
                    mostrarToast('Não encontrado', `${nick} não possui horário registrado`, 'info');
                }
            } catch (error) {
                console.error('Erro:', error);
                mostrarToast('Erro', 'Erro ao consultar horário', 'error');
            }
        }

        async function atualizarHorario() {
            const nick = document.getElementById('atualizar-nickname')?.value;
            const selecionados = document.querySelectorAll('.horario-btn.selected');
            
            if (!nick || selecionados.length === 0) {
                mostrarToast('Erro', 'Selecione pelo menos um horário', 'error');
                return;
            }
            
            const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
            
            try {
                const horariosSelecionados = [];
                const turnosEncontrados = new Set();
                
                for (const btn of selecionados) {
                    const horario = btn.textContent;
                    const turno = getTurno(horario);
                    horariosSelecionados.push(horario);
                    turnosEncontrados.add(turno);
                }

                const turnosArray = Array.from(turnosEncontrados);
                const checkResponse = await fetch(`${SUPABASE_URL}/rest/v1/horarios_usuario?nickname=eq.${nick}`, {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
                const existente = await checkResponse.json();
                
                let response;
                if (existente.length > 0) {
                    response = await fetch(`${SUPABASE_URL}/rest/v1/horarios_usuario?nickname=eq.${nick}`, {
                        method: 'PATCH',
                        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            horarios: horariosSelecionados,
                            turnos: turnosArray,
                            data_atualizacao: new Date().toISOString()
                        })
                    });
                } else {
                    response = await fetch(`${SUPABASE_URL}/rest/v1/horarios_usuario`, {
                        method: 'POST',
                        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            nickname: nick, 
                            horarios: horariosSelecionados,
                            turnos: turnosArray,
                            data_registro: new Date().toISOString(),
                            data_atualizacao: new Date().toISOString()
                        })
                    });
                }

                await registrarLog('horario', 'atualizacao_horario', usuario.nickname, { 
                    alvo: nick, 
                    horarios: horariosSelecionados,
                    turnos: turnosArray
                });
                
                mostrarToast('Sucesso', `${horariosSelecionados.length} horário(s) em ${turnosArray.length} turno(s) atualizado(s)`, 'success');
                document.getElementById('data-alteracao').value = new Date().toLocaleString('pt-BR');

                carregarHorarios();

                document.querySelectorAll('.horario-btn.selected').forEach(b => b.classList.remove('selected'));
                
            } catch (error) {
                console.error('Erro:', error);
                mostrarToast('Erro', 'Erro ao atualizar horário', 'error');
            }
        }

        function initHorariosGrid() {
            const container = document.getElementById('horarios-grid-container');
            if (!container) return;

            const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
            const nickInput = document.getElementById('atualizar-nickname');
            if (nickInput && usuario.nickname) {
                nickInput.value = usuario.nickname;
                nickInput.readOnly = true;
                nickInput.style.background = '#333';
                nickInput.style.cursor = 'not-allowed';
            }
            
            container.innerHTML = HORARIOS.map(h => `
                <button class="horario-btn" onclick="toggleHorario(this)">${h}</button>
            `).join('');
        }

        async function initLogin() {
            const overlay = document.getElementById('login-overlay');
            const loading = document.getElementById('login-loading');
            const content = document.getElementById('login-content');
            if (!overlay) return;
            loading.style.display = 'block';
            content.style.display = 'none';
            const nick = await pegarUsername();
            if (!nick) {
                mostrarMensagem('error', 'Não foi possível identificar seu usuário do fórum.');
                loading.style.display = 'none';
                content.style.display = 'block';
                return;
            }
            const avatarUrl = `https://www.habbo.com.br/habbo-imaging/avatarimage?&user=${nick}&action=std&direction=2&head_direction=3&img_format=png&gesture=sml&headonly=0&size=l`;
            const loginAvatar = document.getElementById('login-avatar');
            const solicitacaoAvatar = document.getElementById('solicitacao-avatar');
            const loginNick = document.getElementById('login-nick');
            const solicitacaoNick = document.getElementById('solicitacao-nick');
            if (loginAvatar) loginAvatar.src = avatarUrl;
            if (solicitacaoAvatar) solicitacaoAvatar.src = avatarUrl;
            if (loginNick) loginNick.textContent = nick;
            if (solicitacaoNick) solicitacaoNick.textContent = nick;
            const usuario = await verificarUsuario(nick);
            usuarioEncontrado = usuario;
            if (usuario) {
                if (usuario.status === 'aprovado') {
                    const loginStatus = document.getElementById('login-status');
                    if (loginStatus) loginStatus.textContent = `Acesso: ${usuario.cargo}`;
                    document.getElementById('login-usuario-encontrado').style.display = 'block';
                    document.getElementById('login-solicitacao').style.display = 'none';
                    if (usuario.cargo_executivo) {
                        document.getElementById('login-cargo-executivo').value = usuario.cargo_executivo;
                    }
                } else if (usuario.status === 'pendente') {
                    mostrarMensagem('info', 'Sua solicitação está pendente de aprovação.');
                    document.getElementById('login-usuario-encontrado').style.display = 'none';
                    document.getElementById('login-solicitacao').style.display = 'block';
                    const btn = document.getElementById('btn-solicitar');
                    btn.disabled = true;
                    btn.textContent = 'Aguardando aprovação';
                } else if (usuario.status === 'rejeitado') {
                    mostrarMensagem('error', 'Seu acesso foi rejeitado.');
                    document.getElementById('login-usuario-encontrado').style.display = 'none';
                    document.getElementById('login-solicitacao').style.display = 'block';
                }
            } else {
                document.getElementById('login-usuario-encontrado').style.display = 'none';
                document.getElementById('login-solicitacao').style.display = 'block';
                mostrarMensagem('info', 'Usuário não encontrado. Solicite acesso.');
            }
            loading.style.display = 'none';
            content.style.display = 'block';
        }

        async function confirmarLogin() {
            if (!usuarioEncontrado) return;
            
            const cargoExecutivo = document.getElementById('login-cargo-executivo')?.value;
            if (!cargoExecutivo) {
                mostrarMensagem('error', 'Selecione seu cargo executivo');
                return;
            }
            
            await fetch(`${SUPABASE_URL}/rest/v1/usuarios?nickname=eq.${usuarioEncontrado.nickname}`, {
                method: 'PATCH',
                headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ cargo_executivo: cargoExecutivo })
            });
            
            usuarioEncontrado.cargo_executivo = cargoExecutivo;
            
            sessionStorage.setItem('usuario', JSON.stringify({
                nickname: usuarioEncontrado.nickname,
                cargo: usuarioEncontrado.cargo,
                cargo_executivo: cargoExecutivo,
                avatar: document.getElementById('login-avatar')?.src || ''
            }));
            
            await registrarLog('login', 'login', usuarioEncontrado.nickname, { cargo: usuarioEncontrado.cargo, cargo_executivo: cargoExecutivo });
            document.getElementById('login-overlay').classList.add('hidden');
            
            const headerAvatar = document.getElementById('header-profile-avatar');
            const headerName = document.getElementById('header-profile-name');
            const headerRole = document.getElementById('header-profile-role');
            if (headerAvatar) headerAvatar.src = document.getElementById('login-avatar')?.src || '';
            if (headerName) headerName.textContent = usuarioEncontrado.nickname;
            if (headerRole) headerRole.textContent = usuarioEncontrado.cargo;
            
            const sidebarName = document.getElementById('profile-sidebar-name');
            const sidebarImg = document.getElementById('profile-sidebar-img');
            if (sidebarName) sidebarName.textContent = usuarioEncontrado.nickname;
            if (sidebarImg) sidebarImg.src = document.getElementById('login-avatar')?.src || '';
            
            const profileNick = document.getElementById('profile-nickname');
            const profileCargoExecutivo = document.getElementById('profile-cargo-executivo');
            const profileCargoTag = document.getElementById('profile-cargo-tag');
            const profileAvatar = document.getElementById('profile-avatar-img');
            if (profileNick) profileNick.textContent = usuarioEncontrado.nickname;
            if (profileCargoExecutivo) profileCargoExecutivo.textContent = cargoExecutivo;
            if (profileCargoTag) {
                if (usuarioEncontrado.cargo === 'Admin') profileCargoTag.textContent = 'ADMIN';
                else if (usuarioEncontrado.cargo === 'DEV') profileCargoTag.textContent = 'DEV';
                else if (usuarioEncontrado.cargo === 'Membro') profileCargoTag.textContent = 'MEMBRO';
                else profileCargoTag.style.display = 'none';
            }
            if (profileAvatar) profileAvatar.src = document.getElementById('login-avatar')?.src || '';
            
            const drawerAvatar = document.getElementById('drawer-avatar-img');
            const drawerName = document.getElementById('drawer-name');
            const drawerRole = document.getElementById('drawer-role');
            if (drawerAvatar) drawerAvatar.src = document.getElementById('login-avatar')?.src || '';
            if (drawerName) drawerName.textContent = usuarioEncontrado.nickname;
            if (drawerRole) drawerRole.textContent = usuarioEncontrado.cargo;
            
            const avAvaliador = document.getElementById('av-avaliador');
            if (avAvaliador) avAvaliador.value = usuarioEncontrado.nickname;
            const sindicanteNick = document.getElementById('sindicante-nick');
            if (sindicanteNick) sindicanteNick.value = usuarioEncontrado.nickname;
            const ouvAutor = document.getElementById('ouv-autor');
            if (ouvAutor) ouvAutor.value = usuarioEncontrado.nickname;
            
            usuariosOnline.add(usuarioEncontrado.nickname);
            atualizarVisibilidadeAdmin();
            carregarAtividades();
            carregarNotificacoes();
            carregarBloqueios();
            carregarHorarios();
            iniciarRealtime();
            iniciarAtualizacaoEmTempoReal();
            mostrarToast('Bem-vindo', `Login realizado como ${usuarioEncontrado.nickname}`, 'success');
        }

        function iniciarRealtime() {
            if (canalRealtime) return;
            const ws = new WebSocket(`wss://${SUPABASE_URL.replace('https://', '')}/realtime/v1/websocket?apikey=${SUPABASE_KEY}`);
            ws.onopen = () => {
                ws.send(JSON.stringify({
                    topic: 'realtime:atividades',
                    event: 'phx_join',
                    payload: {},
                    ref: '1'
                }));
                ws.send(JSON.stringify({
                    topic: 'realtime:bloqueios',
                    event: 'phx_join',
                    payload: {},
                    ref: '2'
                }));
                ws.send(JSON.stringify({
                    topic: 'realtime:horarios',
                    event: 'phx_join',
                    payload: {},
                    ref: '3'
                }));
            };
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.payload && data.payload.record) {
                    if (data.topic === 'realtime:atividades') {
                        carregarAtividades();
                    } else if (data.topic === 'realtime:bloqueios') {
                        const novoBloqueio = data.payload.record;
                        if (novoBloqueio.pagina === 'coleta') {
                            paginaBloqueada.coleta = novoBloqueio.bloqueado;
                            const toggle = document.getElementById('toggle-coleta');
                            if (toggle) toggle.checked = !novoBloqueio.bloqueado;
                        } else if (novoBloqueio.pagina === 'av-mensal') {
                            paginaBloqueada.avMensal = novoBloqueio.bloqueado;
                            const toggle = document.getElementById('toggle-av-mensal');
                            if (toggle) toggle.checked = !novoBloqueio.bloqueado;
                        }
                    } else if (data.topic === 'realtime:horarios') {
                        carregarHorarios();
                    }
                }
            };
            canalRealtime = ws;
        }

        function iniciarAtualizacaoEmTempoReal() {
            if (intervaloAtualizacao) clearInterval(intervaloAtualizacao);
            intervaloAtualizacao = setInterval(() => {
                verificarAtualizacoesEmTempoReal();
                atualizarStatusAtividades();
            }, INTERVALO_ATUALIZACAO);
        }

        async function verificarAtualizacoesEmTempoReal() {
            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/atividades?order=id.desc&limit=10`, {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
                const novasAtividades = await response.json();
                if (novasAtividades.length > atividades.length) {
                    atividades = novasAtividades;
                    carregarAtividades();
                    atualizarEstatisticas();
                }
            } catch (error) {
                console.error('Erro ao verificar atualizações:', error);
            }
        }

        async function carregarBloqueios() {
            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/bloqueios?select=*`, {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
                const bloqueios = await response.json();
                bloqueios.forEach(b => {
                    if (b.pagina === 'coleta') {
                        paginaBloqueada.coleta = b.bloqueado;
                        const toggle = document.getElementById('toggle-coleta');
                        if (toggle) toggle.checked = !b.bloqueado;
                    } else if (b.pagina === 'av-mensal') {
                        paginaBloqueada.avMensal = b.bloqueado;
                        const toggle = document.getElementById('toggle-av-mensal');
                        if (toggle) toggle.checked = !b.bloqueado;
                    }
                });
            } catch (error) {
                console.error('Erro ao carregar bloqueios:', error);
            }
        }

        async function enviarSolicitacao() {
            const nick = document.getElementById('solicitacao-nick')?.textContent;
            const motivo = document.getElementById('motivo-solicitacao')?.value;
            if (!nick) return;
            try {
                await fetch(`${SUPABASE_URL}/rest/v1/solicitacoes_acesso`, {
                    method: 'POST',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nickname: nick, motivo: motivo || '', status: 'pendente' })
                });
                await fetch(`${SUPABASE_URL}/rest/v1/usuarios`, {
                    method: 'POST',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nickname: nick, cargo: 'Membro', status: 'pendente' })
                });
                mostrarMensagem('success', 'Solicitação enviada! Aguarde aprovação.');
                mostrarToast('Solicitação enviada', 'Aguarde a aprovação do administrador', 'success');
                const btn = document.getElementById('btn-solicitar');
                const input = document.getElementById('motivo-solicitacao');
                btn.disabled = true;
                btn.textContent = 'Solicitação enviada';
                input.disabled = true;
            } catch (error) {
                console.error('Erro:', error);
                mostrarMensagem('error', 'Erro ao enviar solicitação.');
                mostrarToast('Erro', 'Não foi possível enviar a solicitação', 'error');
            }
        }

        function mostrarMensagem(tipo, texto) {
            const msg = document.getElementById('login-message');
            if (!msg) return;
            msg.className = `login-message ${tipo}`;
            msg.textContent = texto;
            msg.style.display = 'block';
        }

        function switchPage(pageId) {
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            const page = document.getElementById(`page-${pageId}`);
            if (page) page.classList.add('active');
            const titles = {
                'home': '[CE] SYSTEM', 'profile': 'MEU PERFIL', 'coleta-horarios': 'COLETA DE HORÁRIOS',
                'form-av-mensal': 'FORMULÁRIO AV MENSAL', 'registro-avs': 'REGISTRO DAS AVs',
                'sindicancias': 'CENTRAL DE SINDICÂNCIAS', 'atividades': 'ATIVIDADES',
                'ouvidoria': 'OUVIDORIA', 'admin': 'PAINEL ADMINISTRATIVO'
            };
            const headerTitle = document.getElementById('header-title');
            if (headerTitle) headerTitle.textContent = titles[pageId] || '[CE] SYSTEM';
            if (!verificarBloqueioPagina(pageId)) {
                if (pageId === 'admin' && verificarPermissaoAdmin()) {
                    carregarSolicitacoes();
                    carregarMembros();
                    carregarLogs();
                    carregarDiasSelect();
                }
                if (pageId === 'atividades') carregarAtividades();
                if (pageId === 'coleta-horarios') {
                    carregarHorarios();
                    initHorariosGrid();
                }
            }
            closeDrawer();
            document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        }

        function verificarBloqueioPagina(pageId) {
            const page = document.getElementById(`page-${pageId}`);
            if (!page) return false;
            
            if (pageId === 'coleta-horarios' && paginaBloqueada.coleta) {
                mostrarPaginaBloqueada(page, 'atualizar/consultar seus horários');
                return true;
            } else if (pageId === 'form-av-mensal' && paginaBloqueada.avMensal) {
                mostrarPaginaBloqueada(page, 'avaliar os executivos');
                return true;
            }
            return false;
        }

        function mostrarPaginaBloqueada(page, acao) {
            page.innerHTML = `
                <div class="page-blocked">
                    <div class="blocked-message">
                        <i class="ph ph-lock"></i>
                        <h3>Ação bloqueada</h3>
                        <p>Aguarde a próxima abertura para ${acao}</p>
                        <p style="margin-top: 15px; font-size: 12px;">Se algum erro acontecer, comunique um administrador.</p>
                    </div>
                </div>
            `;
        }

        function openDrawer() {
            document.getElementById('side-drawer').classList.add('active');
            document.getElementById('drawer-overlay').classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeDrawer() {
            document.getElementById('side-drawer').classList.remove('active');
            document.getElementById('drawer-overlay').classList.remove('active');
            document.body.style.overflow = '';
        }

        function switchColetaTab(tab) {
            document.querySelectorAll('.coleta-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.coleta-form').forEach(f => f.classList.remove('active'));
            if (tab === 'consultar') {
                document.querySelector('.coleta-tab:first-child')?.classList.add('active');
                document.getElementById('coleta-form-consultar')?.classList.add('active');
            } else {
                document.querySelector('.coleta-tab:last-child')?.classList.add('active');
                document.getElementById('coleta-form-atualizar')?.classList.add('active');
            }
        }

        function toggleHorario(btn) {
            btn.classList.toggle('selected');
        }

        function adicionarAvaliado() {
            if (avaliadosCount >= 10) {
                mostrarToast('Limite atingido', 'Máximo de 10 avaliados por formulário', 'warning');
                return;
            }
            avaliadosCount++;
            const container = document.getElementById('avaliados-container');
            if (!container) return;
            const row = document.createElement('div');
            row.className = 'avaliado-row';
            row.id = `avaliado-${avaliadosCount}`;
            row.innerHTML = `
                <input type="text" placeholder="Nick do Avaliado ${avaliadosCount}">
                <input type="text" placeholder="Nota">
                <textarea placeholder="Campo de avaliação..."></textarea>
                <button type="button" class="btn-remove-avaliado" onclick="removerAvaliado(${avaliadosCount})"><i class="ph ph-trash"></i></button>
            `;
            container.appendChild(row);
        }

        function removerAvaliado(id) {
            const row = document.getElementById(`avaliado-${id}`);
            if (row) {
                row.remove();
                const rows = document.querySelectorAll('.avaliado-row');
                avaliadosCount = rows.length;
                rows.forEach((r, index) => {
                    const newId = index + 1;
                    r.id = `avaliado-${newId}`;
                    const btn = r.querySelector('.btn-remove-avaliado');
                    if (btn) btn.setAttribute('onclick', `removerAvaliado(${newId})`);
                    const input = r.querySelector('input[type="text"]');
                    if (input) input.placeholder = `Nick do Avaliado ${newId}`;
                });
            }
        }

        function handleAvMensalSubmit(e) {
            e.preventDefault();
            const avaliador = document.getElementById('av-avaliador')?.value;
            const mes = document.getElementById('av-mes')?.value;
            const avaliados = [];
            document.querySelectorAll('.avaliado-row').forEach(row => {
                const inputs = row.querySelectorAll('input, textarea');
                if (inputs.length >= 3) {
                    avaliados.push({ nick: inputs[0].value, nota: inputs[1].value, avaliacao: inputs[2].value });
                }
            });
            mostrarToast('Avaliação enviada', `Avaliação mensal de ${avaliados.length} executivos registrada`, 'success');
        }

        function switchSindicanciaTab(tab) {
            document.querySelectorAll('.sindicancia-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.sindicancia-form').forEach(f => f.classList.remove('active'));
            const tabIndex = ['avaliacao-mensal', 'avanco-indeferida', 'regresso-especializacao'].indexOf(tab);
            const tabs = document.querySelectorAll('.sindicancia-tab');
            const forms = document.getElementById(`sindicancia-form-${tab}`);
            if (tabs[tabIndex]) tabs[tabIndex].classList.add('active');
            if (forms) forms.classList.add('active');
        }

        function enviarSindicancia(tipo) {
            const sindicante = document.getElementById('sindicante-nick')?.value;
            let dados = {};
            if (tipo === 'avaliacao-mensal') {
                dados = {
                    detalhamento: document.getElementById('sin-av-mensal-detalhamento')?.value,
                    reu: document.getElementById('sin-av-mensal-reu')?.value,
                    fundamentacao: document.getElementById('sin-av-mensal-fundamentacao')?.value,
                    pedidos: document.getElementById('sin-av-mensal-pedidos')?.value
                };
            } else if (tipo === 'avanco-indeferida') {
                dados = {
                    detalhamento: document.getElementById('sin-avanco-detalhamento')?.value,
                    reu: document.getElementById('sin-avanco-reu')?.value,
                    fundamentacao: document.getElementById('sin-avanco-fundamentacao')?.value,
                    pedidos: document.getElementById('sin-avanco-pedidos')?.value
                };
            } else if (tipo === 'regresso-especializacao') {
                dados = {
                    detalhamento: document.getElementById('sin-regresso-detalhamento')?.value,
                    reu: document.getElementById('sin-regresso-reu')?.value,
                    motivos: document.getElementById('sin-regresso-motivos')?.value,
                    fundamentacao: document.getElementById('sin-regresso-fundamentacao')?.value,
                    pedidos: document.getElementById('sin-regresso-pedidos')?.value
                };
            }
            mostrarToast('Sindicância enviada', `Sindicância de ${tipo} registrada com sucesso`, 'success');
        }

        function handleOuvidoriaSubmit(e) {
            e.preventDefault();
            const autor = document.getElementById('ouv-autor')?.value;
            const ordem = document.getElementById('ouv-ordem')?.value;
            const sintese = document.getElementById('ouv-sintese')?.value;
            const desenvolvimento = document.getElementById('ouv-desenvolvimento')?.value;
            const tiposSelecionados = [];
            document.querySelectorAll('#checkbox-group-container input:checked').forEach(cb => {
                tiposSelecionados.push(cb.value);
            });
            mostrarToast('Proposta enviada', 'Sua proposta foi registrada na ouvidoria', 'success');
            document.getElementById('ouv-sintese').value = '';
            document.getElementById('ouv-desenvolvimento').value = '';
            document.querySelectorAll('#checkbox-group-container input').forEach(cb => cb.checked = false);
        }

        function setFilter(filter) {
            currentFilter = filter;
            currentPage = 1;
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.filter === filter) btn.classList.add('active');
            });
            updateContentList();
            updatePagination();
        }

        function updateContentList() {
            const container = document.getElementById('content-list');
            if (!container) return;
            container.innerHTML = `<div class="empty-state"><i class="ph ph-folder-open"></i><p>Nenhum conteúdo encontrado.</p></div>`;
        }

        function updatePagination() {
            const currentPageEl = document.getElementById('current-page');
            const btnPrev = document.getElementById('btn-prev');
            const btnNext = document.getElementById('btn-next');
            if (currentPageEl) currentPageEl.textContent = String(currentPage).padStart(2, '0');
            if (btnPrev) btnPrev.disabled = currentPage === 1;
            if (btnNext) btnNext.disabled = currentPage >= 1;
        }

        function changePage(direction) {
            const newPage = currentPage + direction;
            if (newPage >= 1) {
                currentPage = newPage;
                updateContentList();
                updatePagination();
            }
        }

        async function carregarSolicitacoes() {
            if (!verificarPermissaoAdmin()) return;
            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/solicitacoes_acesso?status=eq.pendente&order=data_solicitacao.desc`, {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
                const solicitacoes = await response.json();
                renderSolicitacoes(solicitacoes);
            } catch (error) {
                console.error('Erro ao carregar solicitações:', error);
            }
        }

        function renderSolicitacoes(solicitacoes) {
            const container = document.getElementById('admin-solicitacoes');
            if (!container) return;
            if (solicitacoes.length === 0) {
                container.innerHTML = '<p style="color: #888; text-align: center;">Nenhuma solicitação pendente.</p>';
                return;
            }
            container.innerHTML = solicitacoes.map(s => `
                <div class="solicitacao-card" style="padding: 10px; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: #85e300; font-weight: 600;">${s.nickname}</span>
                        <span style="font-size: 10px; color: #888;">${new Date(s.data_solicitacao).toLocaleString('pt-BR')}</span>
                    </div>
                    <div style="font-size: 11px; margin: 5px 0;">${s.motivo || 'Não informado'}</div>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn-aprovar" style="padding: 5px 10px; font-size: 11px;" onclick="processarSolicitacao(${s.id}, 'aprovada')">Aprovar</button>
                        <button class="btn-rejeitar" style="padding: 5px 10px; font-size: 11px;" onclick="processarSolicitacao(${s.id}, 'rejeitada')">Rejeitar</button>
                    </div>
                </div>
            `).join('');
        }

        async function processarSolicitacao(id, status) {
            if (!verificarPermissaoAdmin()) return;
            const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
            try {
                await fetch(`${SUPABASE_URL}/rest/v1/solicitacoes_acesso?id=eq.${id}`, {
                    method: 'PATCH',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: status, processado_por: usuario.nickname, data_processamento: new Date().toISOString() })
                });
                const response = await fetch(`${SUPABASE_URL}/rest/v1/solicitacoes_acesso?id=eq.${id}&select=nickname`, {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
                const solicitacao = (await response.json())[0];
                await fetch(`${SUPABASE_URL}/rest/v1/usuarios?nickname=eq.${solicitacao.nickname}`, {
                    method: 'PATCH',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: status === 'aprovada' ? 'aprovado' : 'rejeitado' })
                });
                await registrarLog('usuario', `solicitacao_${status}`, usuario.nickname, { alvo: solicitacao.nickname });
                
                criarNotificacao(
                    solicitacao.nickname,
                    status === 'aprovada' ? 'Acesso Aprovado' : 'Acesso Rejeitado',
                    `Sua solicitação de acesso foi ${status === 'aprovada' ? 'aprovada' : 'rejeitada'}.`,
                    status === 'aprovada' ? 'success' : 'error'
                );
                
                mostrarToast('Solicitação processada', `Acesso ${status === 'aprovada' ? 'aprovado' : 'rejeitado'} para ${solicitacao.nickname}`, 'success');
                carregarSolicitacoes();
                carregarMembros();
            } catch (error) {
                console.error('Erro ao processar solicitação:', error);
                mostrarToast('Erro', 'Não foi possível processar a solicitação', 'error');
            }
        }

        async function criarNotificacao(usuarioNick, titulo, mensagem, tipo = 'info') {
            try {
                await fetch(`${SUPABASE_URL}/rest/v1/notificacoes`, {
                    method: 'POST',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        usuario_nick: usuarioNick,
                        titulo: titulo,
                        mensagem: mensagem,
                        tipo: tipo,
                        lida: false
                    })
                });
                
                if (usuarioNick === JSON.parse(sessionStorage.getItem('usuario') || '{}').nickname) {
                    carregarNotificacoes();
                }
            } catch (error) {
                console.error('Erro ao criar notificação:', error);
            }
        }

        async function carregarNotificacoes() {
            const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
            if (!usuario.nickname) return;
            
            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/notificacoes?usuario_nick=eq.${usuario.nickname}&order=data_criacao.desc`, {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
                notificacoes = await response.json();
                notificacoesNaoLidas = notificacoes.filter(n => !n.lida).length;
                renderNotificacoes();
                atualizarBadgeNotificacoes();
            } catch (error) {
                console.error('Erro ao carregar notificações:', error);
            }
        }

        async function marcarNotificacaoLida(id) {
            try {
                await fetch(`${SUPABASE_URL}/rest/v1/notificacoes?id=eq.${id}`, {
                    method: 'PATCH',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lida: true, data_leitura: new Date().toISOString() })
                });
                carregarNotificacoes();
            } catch (error) {
                console.error('Erro ao marcar notificação como lida:', error);
            }
        }

        async function deletarNotificacao(id) {
            try {
                await fetch(`${SUPABASE_URL}/rest/v1/notificacoes?id=eq.${id}`, {
                    method: 'DELETE',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
                carregarNotificacoes();
                mostrarToast('Apagada', 'Mensagem excluída com sucesso', 'success');
            } catch (error) {
                console.error('Erro:', error);
                mostrarToast('Erro', 'Não foi possível remover a notificação', 'error');
            }
        }

        async function marcarTodasLidas() {
            const naoLidas = notificacoes.filter(n => !n.lida);
            for (const n of naoLidas) {
                await marcarNotificacaoLida(n.id);
            }
            mostrarToast('Notificações', 'As notificações foram marcadas como lidas', 'success');
        }

        async function carregarMembros() {
            if (!verificarPermissaoAdmin()) return;
            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/usuarios?order=nickname.asc`, {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
                const membros = await response.json();
                renderMembros(membros);
            } catch (error) {
                console.error('Erro ao carregar membros:', error);
            }
        }

        function renderMembros(membros) {
            const tbody = document.getElementById('membros-tbody');
            if (!tbody) return;
            tbody.innerHTML = membros.map(m => `
                <tr>
                    <td><span class="online-indicator ${usuariosOnline.has(m.nickname) ? 'online' : 'offline'}"></span></td>
                    <td>${m.nickname}</td>
                    <td>
                        <select class="cargo-select" onchange="alterarCargo('${m.nickname}', this.value)" style="font-size: 11px; padding: 3px;">
                            <option value="Membro" ${m.cargo === 'Membro' ? 'selected' : ''}>Membro</option>
                            <option value="Admin" ${m.cargo === 'Admin' ? 'selected' : ''}>Admin</option>
                            <option value="DEV" ${m.cargo === 'DEV' ? 'selected' : ''}>DEV</option>
                        </select>
                    </td>
                    <td><button class="btn-remove-avaliado" style="padding: 3px 6px; font-size: 10px;" onclick="removerUsuario('${m.nickname}')"><i class="ph ph-trash"></i></button></td>
                </tr>
            `).join('');
        }

        async function alterarCargo(nickname, novoCargo) {
            if (!verificarPermissaoAdmin()) return;
            try {
                await fetch(`${SUPABASE_URL}/rest/v1/usuarios?nickname=eq.${nickname}`, {
                    method: 'PATCH',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cargo: novoCargo })
                });
                const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
                await registrarLog('usuario', 'alteracao_cargo', usuario.nickname, { alvo: nickname, novoCargo });
                mostrarToast('Cargo alterado', `${nickname} agora é ${novoCargo}`, 'success');
                atualizarVisibilidadeAdmin();
            } catch (error) {
                console.error('Erro ao alterar cargo:', error);
                mostrarToast('Erro', 'Não foi possível alterar o cargo', 'error');
            }
        }

        async function removerUsuario(nickname) {
            if (!verificarPermissaoAdmin()) return;
            if (!confirm(`Tem certeza que deseja remover o usuário ${nickname}?`)) return;
            try {
                await fetch(`${SUPABASE_URL}/rest/v1/usuarios?nickname=eq.${nickname}`, {
                    method: 'DELETE',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
                const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
                await registrarLog('usuario', 'remocao_usuario', usuario.nickname, { alvo: nickname });
                mostrarToast('Usuário removido', `${nickname} foi removido do sistema`, 'success');
                carregarMembros();
            } catch (error) {
                console.error('Erro ao remover usuário:', error);
                mostrarToast('Erro', 'Não foi possível remover o usuário', 'error');
            }
        }

        function atualizarOnlineStatus() {
            document.querySelectorAll('#membros-tbody tr').forEach(linha => {
                const nick = linha.querySelector('td:nth-child(2)')?.textContent;
                const indicador = linha.querySelector('.online-indicator');
                if (nick && indicador) {
                    if (usuariosOnline.has(nick)) {
                        indicador.classList.remove('offline');
                        indicador.classList.add('online');
                    } else {
                        indicador.classList.remove('online');
                        indicador.classList.add('offline');
                    }
                }
            });
        }

        function carregarDiasSelect() {
            const select = document.getElementById('atividade-dia');
            if (!select) return;
            const hoje = new Date();
            const ano = hoje.getFullYear();
            const mes = hoje.getMonth();
            const ultimoDia = new Date(ano, mes + 1, 0).getDate();
            let options = '';
            for (let dia = 1; dia <= ultimoDia; dia++) {
                const data = new Date(ano, mes, dia);
                const diaSemana = data.toLocaleDateString('pt-BR', { weekday: 'short' });
                options += `<option value="${dia}">${dia} - ${diaSemana}</option>`;
            }
            select.innerHTML = options;
        }

        function atualizarStatusAtividades() {
            const agora = new Date();
            atividades.forEach(a => {
                const dataAtividade = new Date(`${a.data}T${a.hora}`);
                if (agora > dataAtividade) {
                    a.status = 'concluido';
                } else if (agora.toDateString() === dataAtividade.toDateString() && agora <= dataAtividade) {
                    a.status = 'em_andamento';
                } else {
                    a.status = 'pendente';
                }
            });
            carregarAtividades();
            atualizarEstatisticas();
        }

        async function carregarAtividades() {
            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/atividades?order=data.asc`, {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
                atividades = await response.json();
                atualizarStatusAtividades();
                const titulo = document.getElementById('calendario-titulo');
                if (titulo) {
                    const hoje = new Date();
                    titulo.textContent = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
                }
                const calendarGrid = document.getElementById('calendar-grid');
                if (calendarGrid) {
                    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                    let calendarHTML = diasSemana.map(d => `<div class="calendar-day-header">${d}</div>`).join('');
                    const hoje = new Date();
                    const ano = hoje.getFullYear();
                    const mes = hoje.getMonth();
                    const primeiroDia = new Date(ano, mes, 1).getDay();
                    const ultimoDia = new Date(ano, mes + 1, 0).getDate();
                    for (let i = 0; i < primeiroDia; i++) {
                        calendarHTML += `<div class="calendar-day"></div>`;
                    }
                    for (let dia = 1; dia <= ultimoDia; dia++) {
                        const dataStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
                        const temAtividade = atividades.some(a => a.data === dataStr);
                        const isToday = dia === hoje.getDate() ? 'today' : '';
                        calendarHTML += `<div class="calendar-day ${temAtividade ? 'has-event' : ''} ${isToday}">${dia}</div>`;
                    }
                    calendarGrid.innerHTML = calendarHTML;
                }
                const eventList = document.getElementById('event-list');
                if (eventList) {
                    const eventosOrdenados = [...atividades].sort((a, b) => new Date(b.data + 'T' + b.hora) - new Date(a.data + 'T' + a.hora));
                    
                    eventList.innerHTML = eventosOrdenados.map(e => {
                        let statusClass = '';
                        let statusTexto = e.status;
                        if (e.status === 'pendente') { statusClass = 'status-pendente'; statusTexto = 'Pendente'; }
                        else if (e.status === 'em_andamento') { statusClass = 'status-em_andamento'; statusTexto = 'Em Andamento'; }
                        else if (e.status === 'concluido') { statusClass = 'status-concluido'; statusTexto = 'Concluído'; }
                        
                        const dataHora = new Date(e.data + 'T' + e.hora);
                        const dataFormatada = dataHora.toLocaleDateString('pt-BR');
                        const horaFormatada = dataHora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                        return `
                            <div class="event-item">
                                <div class="event-date"><strong>${dataFormatada} - ${horaFormatada}</strong></div>
                                <div class="event-title">${e.titulo}</div>
                                ${e.descricao ? `<div style="font-size:12px; color:#ccc; margin: 5px 0;">${e.descricao}</div>` : ''}
                                <div class="event-meta">
                                    <span class="status-badge ${statusClass}">${statusTexto}</span>
                                    <span>Por: ${e.criado_por || 'Sistema'}</span>
                                </div>
                            </div>
                        `;
                    }).join('');
                    
                    if (eventosOrdenados.length === 0) {
                        eventList.innerHTML = '<div class="empty-state" style="padding: 20px;"><i class="ph ph-calendar-blank"></i><p>Nenhuma atividade encontrada.</p></div>';
                    }
                }
                const proximas = document.getElementById('proximas-atividades');
                if (proximas) {
                    const agora = new Date();
                    const proximasAtividades = atividades.filter(a => new Date(`${a.data}T${a.hora}`) > agora).slice(0, 5);
                    proximas.innerHTML = proximasAtividades.map(a => {
                        const dataHora = new Date(a.data + 'T' + a.hora);
                        const dataFormatada = dataHora.toLocaleDateString('pt-BR');
                        const horaFormatada = dataHora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                        return `
                            <div class="atividade-item">
                                <div class="header">
                                    <span class="titulo">${a.titulo}</span>
                                    <span class="data-hora">${dataFormatada} ${horaFormatada}</span>
                                </div>
                                ${a.descricao ? `<div style="font-size:10px; color:#aaa;">${a.descricao.substring(0, 30)}${a.descricao.length > 30 ? '...' : ''}</div>` : ''}
                                <div class="status"><span class="status-indicator ${a.status}">${a.status.replace('_', ' ')}</span></div>
                            </div>
                        `;
                    }).join('') || '<p style="color: #888; font-size: 12px;">Nenhuma atividade futura.</p>';
                }
            } catch (error) {
                console.error('Erro ao carregar atividades:', error);
            }
        }

        function atualizarEstatisticas() {
            const total = atividades.length;
            const pendentes = atividades.filter(a => a.status === 'pendente').length;
            const andamento = atividades.filter(a => a.status === 'em_andamento').length;
            const concluidas = atividades.filter(a => a.status === 'concluido').length;
            document.getElementById('stat-total-atividades').textContent = total;
            document.getElementById('stat-pendentes').textContent = pendentes;
            document.getElementById('stat-andamento').textContent = andamento;
            document.getElementById('stat-concluidas').textContent = concluidas;
        }

        async function marcarAtividade() {
            if (!verificarPermissaoAdmin()) {
                mostrarToast('Acesso negado', 'Apenas administradores podem criar atividades', 'error');
                return;
            }
            const dia = document.getElementById('atividade-dia')?.value;
            const hora = document.getElementById('atividade-hora')?.value;
            const titulo = document.getElementById('atividade-titulo')?.value.trim();
            const descricao = document.getElementById('atividade-descricao')?.value.trim();

            if (!titulo || !hora || !dia) {
                mostrarToast('Campos obrigatórios', 'Preencha título, dia e hora da atividade', 'warning');
                return;
            }

            const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');

            const hoje = new Date();
            const ano = hoje.getFullYear();
            const mes = hoje.getMonth(); // 0-11

            const dataObj = new Date(ano, mes, dia);
            const anoStr = dataObj.getFullYear();
            const mesStr = String(dataObj.getMonth() + 1).padStart(2, '0');
            const diaStr = String(dataObj.getDate()).padStart(2, '0');
            const dataFormatada = `${anoStr}-${mesStr}-${diaStr}`;

            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/atividades`, {
                    method: 'POST',
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' }, // 'Prefer' ajuda a pedir o objeto de volta
                    body: JSON.stringify({
                        titulo: titulo,
                        descricao: descricao || '',
                        data: dataFormatada,
                        hora: hora,
                        status: 'pendente',
                        criado_por: usuario.nickname
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Erro na criação:', errorText);
                    mostrarToast('Erro', `Falha ao criar atividade (${response.status})`, 'error');
                    return;
                }

                let novaAtividade = null;
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    novaAtividade = await response.json();
                }

                await registrarLog('atividade', 'criacao_atividade', usuario.nickname, novaAtividade || { titulo, data: dataFormatada });

                const usuariosResponse = await fetch(`${SUPABASE_URL}/rest/v1/usuarios?select=nickname`, {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
                const usuarios = await usuariosResponse.json();

                if (Array.isArray(usuarios)) {
                    for (const u of usuarios) {
                        await criarNotificacao(
                            u.nickname,
                            'Nova Atividade',
                            `${usuario.nickname} marcou uma atividade: ${titulo} para ${dataFormatada} às ${hora}`,
                            'info'
                        );
                    }
                }

                document.getElementById('atividade-titulo').value = '';
                document.getElementById('atividade-descricao').value = '';

                mostrarToast('Atividade criada', 'Atividade marcada com sucesso no calendário', 'success');

                await carregarAtividades();
                atualizarEstatisticas();

            } catch (error) {
                console.error('Erro ao marcar atividade:', error);
                mostrarToast('Erro', 'Não foi possível criar a atividade', 'error');
            }
        }

        async function togglePagina(pagina) {
            if (!verificarPermissaoAdmin()) {
                mostrarToast('Acesso negado', 'Apenas administradores podem bloquear páginas', 'error');
                return;
            }
            const toggle = document.getElementById(`toggle-${pagina}`);
            const status = toggle.checked ? 'liberado' : 'bloqueado';
            const bloqueado = !toggle.checked;
            
            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/bloqueios?pagina=eq.${pagina}`, {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
                const exists = await response.json();
                
                if (exists.length > 0) {
                    await fetch(`${SUPABASE_URL}/rest/v1/bloqueios?pagina=eq.${pagina}`, {
                        method: 'PATCH',
                        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ bloqueado: bloqueado, atualizado_em: new Date().toISOString() })
                    });
                } else {
                    await fetch(`${SUPABASE_URL}/rest/v1/bloqueios`, {
                        method: 'POST',
                        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ pagina: pagina, bloqueado: bloqueado })
                    });
                }
                
                if (pagina === 'coleta') {
                    paginaBloqueada.coleta = bloqueado;
                } else if (pagina === 'av-mensal') {
                    paginaBloqueada.avMensal = bloqueado;
                }
                
                const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
                await registrarLog('pagina', `${pagina}_${status}`, usuario.nickname, {});
                
                const todosUsuarios = await fetch(`${SUPABASE_URL}/rest/v1/usuarios?select=nickname`, {
                    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
                });
                const usuarios = await todosUsuarios.json();
                
                const nomePagina = pagina === 'coleta' ? 'Coleta de horários' : 'Avaliação mensal';
                for (const u of usuarios) {
                    await criarNotificacao(
                        u.nickname,
                        'Atualização',
                        `A página ${nomePagina} foi ${status}.`,
                        'alerta'
                    );
                }
                
                const pageAtual = document.querySelector('.page.active')?.id;
                if (pageAtual) verificarBloqueioPagina(pageAtual.replace('page-', ''));
                
                mostrarToast('Atualização', `Página ${nomePagina} ${status}`, 'success');
            } catch (error) {
                console.error('Erro:', error);
                toggle.checked = !toggle.checked;
                mostrarToast('Erro', 'Não foi possível atualizar o bloqueio', 'error');
            }
        }

        function toggleNotificacoes() {
            document.getElementById('notif-dropdown').classList.toggle('show');
        }

        function renderNotificacoes() {
            const list = document.getElementById('notif-list');
            if (!list) return;
            
            if (notificacoes.length === 0) {
                list.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Nenhuma notificação</div>';
                return;
            }
            
            list.innerHTML = notificacoes.map(n => `
                <div class="notif-item ${!n.lida ? 'unread' : ''}" onclick="marcarNotificacaoLida(${n.id})">
                    <div class="notif-titulo">${n.titulo}</div>
                    <div class="notif-texto">${n.mensagem}</div>
                    <div class="notif-data">${new Date(n.data_criacao).toLocaleString('pt-BR')}</div>
                    <div class="notif-delete" onclick="event.stopPropagation(); deletarNotificacao(${n.id})"><i class="ph ph-trash"></i></div>
                </div>
            `).join('');
        }

        function atualizarBadgeNotificacoes() {
            const badge = document.getElementById('notif-badge');
            if (notificacoesNaoLidas > 0) {
                badge.textContent = notificacoesNaoLidas;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }

        function init() {
            const usuarioSalvo = sessionStorage.getItem('usuario');
            if (usuarioSalvo) {
                try {
                    const userData = JSON.parse(usuarioSalvo);
                    const headerAvatar = document.getElementById('header-profile-avatar');
                    const headerName = document.getElementById('header-profile-name');
                    const headerRole = document.getElementById('header-profile-role');
                    if (headerAvatar) headerAvatar.src = userData.avatar || '';
                    if (headerName) headerName.textContent = userData.nickname || '';
                    if (headerRole) headerRole.textContent = userData.cargo || '';
                    
                    const sidebarName = document.getElementById('profile-sidebar-name');
                    const sidebarImg = document.getElementById('profile-sidebar-img');
                    if (sidebarName) sidebarName.textContent = userData.nickname || '';
                    if (sidebarImg) sidebarImg.src = userData.avatar || '';
                    
                    const profileNick = document.getElementById('profile-nickname');
                    const profileCargoExecutivo = document.getElementById('profile-cargo-executivo');
                    const profileCargoTag = document.getElementById('profile-cargo-tag');
                    const profileAvatar = document.getElementById('profile-avatar-img');
                    if (profileNick) profileNick.textContent = userData.nickname || '';
                    if (profileCargoExecutivo) profileCargoExecutivo.textContent = userData.cargo_executivo || '';
                    if (profileCargoTag) {
                        if (userData.cargo === 'Admin') profileCargoTag.textContent = 'ADMIN';
                        else if (userData.cargo === 'DEV') profileCargoTag.textContent = 'DEV';
                        else if (userData.cargo === 'Membro') profileCargoTag.textContent = 'MEMBRO';
                        else profileCargoTag.style.display = 'none';
                    }
                    if (profileAvatar) profileAvatar.src = userData.avatar || '';
                    
                    const drawerAvatar = document.getElementById('drawer-avatar-img');
                    const drawerName = document.getElementById('drawer-name');
                    const drawerRole = document.getElementById('drawer-role');
                    if (drawerAvatar) drawerAvatar.src = userData.avatar || '';
                    if (drawerName) drawerName.textContent = userData.nickname || '';
                    if (drawerRole) drawerRole.textContent = userData.cargo || '';
                    
                    const avAvaliador = document.getElementById('av-avaliador');
                    if (avAvaliador) avAvaliador.value = userData.nickname || '';
                    const sindicanteNick = document.getElementById('sindicante-nick');
                    if (sindicanteNick) sindicanteNick.value = userData.nickname || '';
                    const ouvAutor = document.getElementById('ouv-autor');
                    if (ouvAutor) ouvAutor.value = userData.nickname || '';
                    
                    document.getElementById('login-overlay').style.display = 'none';
                    usuariosOnline.add(userData.nickname);
                    atualizarVisibilidadeAdmin();
                    carregarNotificacoes();
                    carregarBloqueios();
                    carregarHorarios();
                    iniciarRealtime();
                    iniciarAtualizacaoEmTempoReal();
                } catch (e) {
                    console.error('Erro ao carregar usuário salvo:', e);
                    sessionStorage.removeItem('usuario');
                }
            }
            setupEventListeners();
            carregarAtividades();
        }

        function setupEventListeners() {
            const menuBtn = document.getElementById('mobile-menu-btn');
            if (menuBtn) menuBtn.addEventListener('click', openDrawer);
            const drawerOverlay = document.getElementById('drawer-overlay');
            if (drawerOverlay) drawerOverlay.addEventListener('click', closeDrawer);
            const formAvMensal = document.getElementById('form-av-mensal');
            if (formAvMensal) formAvMensal.addEventListener('submit', handleAvMensalSubmit);
            const formOuvidoria = document.getElementById('form-ouvidoria');
            if (formOuvidoria) formOuvidoria.addEventListener('submit', handleOuvidoriaSubmit);
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    setFilter(this.dataset.filter);
                });
            });
            document.addEventListener('click', function(event) {
                const notifCard = document.getElementById('notif-card');
                const notifDropdown = document.getElementById('notif-dropdown');
                if (!notifCard?.contains(event.target) && !notifDropdown?.contains(event.target)) {
                    notifDropdown?.classList.remove('show');
                }
            });
        }

        document.addEventListener('DOMContentLoaded', () => {
            init();
            initLogin();
        });