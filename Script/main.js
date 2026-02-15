        const SUPABASE_URL = 'https://adozejfhxwtbyuczvzyc.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkb3plamZoeHd0Ynl1Y3p2enljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5ODgwNzIsImV4cCI6MjA4NjU2NDA3Mn0.yXccuiEV1sjZKHVJ4q-TuEuHDOsn7ywrus8RlA-o628';

        let DADOS = {
            usuarios: [],
            horarios: [],
            atividades: [],
            notificacoes: [],
            solicitacoes: [],
            bloqueios: [],
            logs: [],
            links: []
        };

        let usuarioEncontrado = null;
        let avaliadosCount = 0;
        let currentPage = 1;
        let itemsPerPage = 3;
        let currentFilter = 'all';
        let notificacoesNaoLidas = 0;
        let paginaBloqueada = { coleta: false, avMensal: false };
        let alteracoesCargos = {};
        let intervaloAtualizacao = null;
        const INTERVALO_ATUALIZACAO = 2000;
        let membrosSelecionados = new Set();

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
            if (!container) return;
            
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
            }, 3000);
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
            return null;
        }

        async function carregarDados() {
            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/dados_sistema?select=*`, {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': 'Bearer ' + SUPABASE_KEY,
                        'Cache-Control': 'no-cache'
                    },
                    cache: 'no-store'
                });

                if (response.ok) {
                    const dadosArray = await response.json();
                    if (dadosArray && dadosArray.length > 0) {
                        DADOS = dadosArray[0].conteudo;
                        if (!DADOS.solicitacoes) DADOS.solicitacoes = [];
                        if (!DADOS.notificacoes) DADOS.notificacoes = [];
                        if (!DADOS.links) DADOS.links = [];
                        if (!DADOS.atividades) DADOS.atividades = [];
                        if (!DADOS.bloqueios) DADOS.bloqueios = [];
                        return true;
                    }
                }
                return false;
            } catch (error) {
                console.error('Erro ao carregar dados:', error);
                return false;
            }
        }

        async function salvarDados() {
            try {
                const checkResponse = await fetch(`${SUPABASE_URL}/rest/v1/dados_sistema?select=id`, {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': 'Bearer ' + SUPABASE_KEY
                    }
                });

                if (!checkResponse.ok) return false;

                const registros = await checkResponse.json();

                if (registros && registros.length > 0) {
                    const id = registros[0].id;
                    await fetch(`${SUPABASE_URL}/rest/v1/dados_sistema?id=eq.${id}`, {
                        method: 'PATCH',
                        headers: {
                            'apikey': SUPABASE_KEY,
                            'Authorization': 'Bearer ' + SUPABASE_KEY,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            conteudo: DADOS,
                            updated_at: new Date().toISOString()
                        })
                    });
                } else {
                    await fetch(`${SUPABASE_URL}/rest/v1/dados_sistema`, {
                        method: 'POST',
                        headers: {
                            'apikey': SUPABASE_KEY,
                            'Authorization': 'Bearer ' + SUPABASE_KEY,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            conteudo: DADOS
                        })
                    });
                }
                return true;
            } catch (error) {
                console.error('Erro ao salvar dados:', error);
                return false;
            }
        }

        function verificarPermissaoAdmin() {
            return usuarioEncontrado && (usuarioEncontrado.cargo === 'Admin' || usuarioEncontrado.cargo === 'DEV');
        }

        function verificarUsuarioAutorizado(nickname) {
            const usuario = DADOS.usuarios?.find(u => u.nickname?.toLowerCase() === nickname.toLowerCase());
            return usuario && usuario.status === 'aprovado';
        }

        function atualizarVisibilidadeAdmin() {
            const temPermissao = verificarPermissaoAdmin();
            const menuAdmin = document.getElementById('menu-admin');
            const drawerAdmin = document.getElementById('drawer-admin');
            if (menuAdmin) menuAdmin.style.display = temPermissao ? 'flex' : 'none';
            if (drawerAdmin) drawerAdmin.style.display = temPermissao ? 'flex' : 'none';
        }

        function abrirModalEditarCargo() {
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.id = 'modal-editar-cargo';
            modal.innerHTML = `
                <div class="modal-content">
                    <h3>EDITAR CARGO</h3>
                    <select id="modal-cargo-select" class="styled-select">
                        <option value="Supervisor">Supervisor</option>
                        <option value="Supervisor-Geral">Supervisor-Geral</option>
                        <option value="Inspetor">Inspetor</option>
                        <option value="Inspetor-Geral">Inspetor-Geral</option>
                        <option value="Coordenador">Coordenador</option>
                        <option value="Coordenador-Geral">Coordenador-Geral</option>
                        <option value="Superintendente">Superintendente</option>
                        <option value="Superintendente-Geral">Superintendente-Geral</option>
                        <option value="VIP">VIP</option>
                        <option value="Vice-Presidente">Vice-Presidente</option>
                        <option value="Presidente">Presidente</option>
                        <option value="Acionista Majoritário">Acionista Majoritário</option>
                        <option value="Chanceler">Chanceler</option>
                    </select>
                    <div class="modal-actions">
                        <button class="modal-btn confirm" onclick="salvarEdicaoCargo()">Salvar</button>
                        <button class="modal-btn cancel" onclick="fecharModal()">Cancelar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            document.getElementById('modal-cargo-select').value = usuarioEncontrado.cargo_executivo || '';
        }

        function fecharModal() {
            const modal = document.getElementById('modal-editar-cargo');
            if (modal) modal.remove();
        }

        async function salvarEdicaoCargo() {
            const novoCargo = document.getElementById('modal-cargo-select').value;
            if (!novoCargo) {
                mostrarToast('Erro', 'Selecione um cargo', 'error');
                return;
            }
            
            const index = DADOS.usuarios?.findIndex(u => u.nickname === usuarioEncontrado.nickname);
            if (index !== -1) {
                DADOS.usuarios[index].cargo_executivo = novoCargo;
                DADOS.usuarios[index].cargo_executivo_alterado = true;
                usuarioEncontrado.cargo_executivo = novoCargo;
                
                document.getElementById('profile-info-cargo-executivo').textContent = novoCargo;
                
                const usuarioSalvo = JSON.parse(sessionStorage.getItem('usuario') || '{}');
                usuarioSalvo.cargo_executivo = novoCargo;
                usuarioSalvo.cargo_executivo_alterado = true;
                sessionStorage.setItem('usuario', JSON.stringify(usuarioSalvo));
                
                await registrarLog('usuario', 'alteracao_cargo_executivo', usuarioEncontrado.nickname, { novoCargo });
                await salvarDados();
                
                mostrarToast('Cargo atualizado', `Seu cargo agora é ${novoCargo}`, 'success');
                fecharModal();
            }
        }

        function toggleDrawerSection(section) {
            const submenu = document.getElementById(`drawer-submenu-${section}`);
            const sectionEl = Array.from(document.querySelectorAll('.drawer-section')).find(el => el.textContent.includes(section === 'principal' ? 'Menu Principal' : section === 'avaliacoes' ? 'Avaliações' : 'Geral'));
            
            if (submenu) {
                submenu.classList.toggle('open');
                if (sectionEl) sectionEl.classList.toggle('open');
            }
        }

        function switchProfileTab(tab) {
            document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.profile-tab-content').forEach(c => c.classList.remove('active'));
            
            if (tab === 'info') {
                document.querySelectorAll('.profile-tab')[0].classList.add('active');
                document.getElementById('profile-tab-info').classList.add('active');
            } else {
                document.querySelectorAll('.profile-tab')[1].classList.add('active');
                document.getElementById('profile-tab-estatisticas').classList.add('active');
                carregarEstatisticasPerfil();
            }
        }

        function carregarEstatisticasPerfil() {
            if (!usuarioEncontrado) return;
            
            const horario = (DADOS.horarios || []).find(h => h.nickname.toLowerCase() === usuarioEncontrado.nickname.toLowerCase());
            
            if (horario) {
                const turnosArray = horario.turnos || [];
                const horariosArray = horario.horarios || [];
                
                document.getElementById('profile-info-turnos').textContent = turnosArray.join(' / ') || 'Nenhum';
                document.getElementById('profile-info-horarios').textContent = horariosArray.join(' / ') || 'Nenhum';
            } else {
                document.getElementById('profile-info-turnos').textContent = 'Nenhum';
                document.getElementById('profile-info-horarios').textContent = 'Nenhum';
            }
        }

        async function carregarLogs() {
            if (!verificarPermissaoAdmin()) return;
            
            const container = document.getElementById('log-container');
            if (!container) return;
            
            const logs = DADOS.logs || [];
            
            if (logs.length === 0) {
                container.innerHTML = '<div class="log-item" style="color:#888; text-align:center;">Nenhum log encontrado.</div>';
                return;
            }
            
            container.innerHTML = logs.sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 50).map(l => `
                <div class="log-item">
                    <span class="log-data">${new Date(l.data).toLocaleString('pt-BR')}</span>
                    <span class="log-tipo ${l.tipo || ''}">${l.tipo || 'sistema'}</span>
                    <strong>${l.responsavel || 'Sistema'}</strong> - ${l.acao || 'Ação sem descrição'}
                </div>
            `).join('');
        }

        async function registrarLog(tipo, acao, responsavel, detalhes = {}) {
            if (!DADOS.logs) DADOS.logs = [];
            DADOS.logs.push({
                id: Date.now() + Math.random(),
                tipo,
                acao,
                responsavel,
                detalhes,
                data: new Date().toISOString()
            });
            await salvarDados();
        }

        async function carregarHorarios() {
            const tbody = document.getElementById('coleta-table-body');
            if (!tbody) return;
            
            const horarios = DADOS.horarios || [];
            
            if (horarios.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #888; padding: 20px;">Nenhum horário registrado</td></tr>';
                return;
            }
            
            tbody.innerHTML = horarios.map(h => {
                const horariosArray = h.horarios || [];
                const turnosArray = h.turnos || [];
                const turnosFormatados = turnosArray.join(' / ');
                const horariosFormatados = horariosArray.join(' / ');
                
                return `
                    <tr>
                        <td><strong>${h.nickname}</strong></td>
                        <td>${turnosFormatados || '-'}</td>
                        <td>${horariosFormatados || '-'}</td>
                    </tr>
                `;
            }).join('');
        }

        async function consultarHorario() {
            const nick = document.getElementById('consultar-nickname')?.value;
            if (!nick) {
                mostrarToast('Erro', 'Digite um nickname', 'error');
                return;
            }
            
            const horario = (DADOS.horarios || []).find(h => h.nickname.toLowerCase() === nick.toLowerCase());
            
            if (horario) {
                const horariosArray = horario.horarios || [];
                const turnosArray = horario.turnos || [];

                const horariosPorTurno = {};
                horariosArray.forEach(h => {
                    const turno = getTurno(h);
                    if (!horariosPorTurno[turno]) horariosPorTurno[turno] = [];
                    horariosPorTurno[turno].push(h);
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
                            <span style="color: #888; font-size: 12px;">Última atualização: ${new Date(horario.data_atualizacao || horario.data_registro).toLocaleString('pt-BR')}</span>
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
                
                mostrarToast('Consulta realizada', `Horário de ${nick} encontrado`, 'success');
            } else {
                mostrarToast('Não encontrado', `${nick} não possui horário registrado`, 'info');
            }
        }

        async function atualizarHorario() {
            const nick = document.getElementById('atualizar-nickname')?.value;
            const selecionados = document.querySelectorAll('.horario-btn.selected');
            
            if (!nick || selecionados.length === 0) {
                mostrarToast('Erro', 'Selecione pelo menos um horário', 'error');
                return;
            }
            
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
                
                if (!DADOS.horarios) DADOS.horarios = [];
                
                const index = DADOS.horarios.findIndex(h => h.nickname.toLowerCase() === nick.toLowerCase());
                
                if (index !== -1) {
                    DADOS.horarios[index] = {
                        ...DADOS.horarios[index],
                        horarios: horariosSelecionados,
                        turnos: turnosArray,
                        data_atualizacao: new Date().toISOString()
                    };
                } else {
                    DADOS.horarios.push({
                        nickname: nick,
                        horarios: horariosSelecionados,
                        turnos: turnosArray,
                        data_registro: new Date().toISOString(),
                        data_atualizacao: new Date().toISOString()
                    });
                }

                await registrarLog('horario', 'atualizacao_horario', usuarioEncontrado.nickname, { 
                    alvo: nick, 
                    horarios: horariosSelecionados,
                    turnos: turnosArray
                });
                
                await salvarDados();
                
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

            if (usuarioEncontrado && usuarioEncontrado.nickname) {
                const nickInput = document.getElementById('atualizar-nickname');
                if (nickInput) {
                    nickInput.value = usuarioEncontrado.nickname;
                    nickInput.readOnly = true;
                    nickInput.style.background = '#333';
                    nickInput.style.cursor = 'not-allowed';
                }
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
            
            await carregarDados();
            
            const usuarioSalvo = sessionStorage.getItem('usuario');
            if (usuarioSalvo) {
                try {
                    const userData = JSON.parse(usuarioSalvo);
                    if (verificarUsuarioAutorizado(userData.nickname)) {
                        realizarLoginAutomatico(userData);
                        return;
                    }
                } catch (e) {
                    console.error('Erro ao carregar usuário salvo:', e);
                }
            }
            
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
            
            const usuario = DADOS.usuarios?.find(u => u.nickname?.toLowerCase() === nick.toLowerCase());
            usuarioEncontrado = usuario;
            
            const cargoSelect = document.getElementById('login-cargo-executivo');
            
            if (usuario) {
                if (usuario.status === 'aprovado') {
                    if (usuario.cargo_executivo && !usuario.primeiro_login) {
                        realizarLoginAutomatico(usuario);
                    } else {
                        document.getElementById('login-usuario-encontrado').style.display = 'block';
                        document.getElementById('login-solicitacao').style.display = 'none';
                        cargoSelect.style.display = 'block';
                        document.querySelector('.login-cargo-select label').style.display = 'block';
                        
                        if (usuario.cargo_executivo && usuario.primeiro_login) {
                            cargoSelect.value = usuario.cargo_executivo;
                        }
                        
                        loading.style.display = 'none';
                        content.style.display = 'block';
                    }
                } else if (usuario.status === 'pendente') {
                    document.getElementById('login-usuario-encontrado').style.display = 'none';
                    document.getElementById('login-solicitacao').style.display = 'block';
                    const btn = document.getElementById('btn-solicitar');
                    btn.disabled = true;
                    btn.textContent = 'Aguardando aprovação';
                    document.getElementById('mensagem-aguarde').style.display = 'block';
                    mostrarMensagem('info', 'Sua solicitação está pendente de aprovação.');
                    loading.style.display = 'none';
                    content.style.display = 'block';
                } else if (usuario.status === 'rejeitado') {
                    const solicitacao = DADOS.solicitacoes?.find(s => s.nickname === nick && s.status === 'rejeitada');
                    const justificativa = solicitacao?.justificativa || 'não informado';
                    
                    document.getElementById('login-usuario-encontrado').style.display = 'none';
                    document.getElementById('login-solicitacao').style.display = 'block';
                    document.getElementById('mensagem-aguarde').style.display = 'none';
                    const btn = document.getElementById('btn-solicitar');
                    btn.disabled = false;
                    btn.textContent = 'Solicitar Acesso';
                    
                    mostrarMensagem('error', `Acesso negado. Motivo: ${justificativa}. Aguarde 3s...`);
                    
                    setTimeout(() => {
                        const msg = document.getElementById('login-message');
                        if (msg) msg.style.display = 'none';
                    }, 3000);
                    
                    loading.style.display = 'none';
                    content.style.display = 'block';
                }
            } else {
                document.getElementById('login-usuario-encontrado').style.display = 'none';
                document.getElementById('login-solicitacao').style.display = 'block';
                document.getElementById('mensagem-aguarde').style.display = 'none';
                mostrarMensagem('info', 'Usuário não encontrado. Solicite acesso.');
                loading.style.display = 'none';
                content.style.display = 'block';
            }
        }

        function realizarLoginAutomatico(usuario) {
            const avatarUrl = `https://www.habbo.com.br/habbo-imaging/avatarimage?&user=${usuario.nickname}&action=std&direction=2&head_direction=3&img_format=png&gesture=sml&headonly=0&size=l`;
            
            sessionStorage.setItem('usuario', JSON.stringify({
                nickname: usuario.nickname,
                cargo: usuario.cargo || 'Membro',
                cargo_executivo: usuario.cargo_executivo || '',
                cargo_executivo_alterado: usuario.cargo_executivo_alterado || false,
                avatar: avatarUrl,
                primeiro_login: usuario.primeiro_login || false
            }));

            usuarioEncontrado = usuario;

            document.getElementById('login-overlay').classList.add('hidden');

            const headerAvatar = document.getElementById('header-profile-avatar');
            const headerName = document.getElementById('header-profile-name');
            const headerRole = document.getElementById('header-profile-role');
            if (headerAvatar) headerAvatar.src = avatarUrl;
            if (headerName) headerName.textContent = usuario.nickname;
            if (headerRole) headerRole.textContent = usuario.cargo || 'Membro';

            const sidebarName = document.getElementById('profile-sidebar-name');
            const sidebarImg = document.getElementById('profile-sidebar-img');
            if (sidebarName) sidebarName.textContent = usuario.nickname;
            if (sidebarImg) sidebarImg.src = avatarUrl;

            const profileAvatar = document.getElementById('profile-avatar-img');
            if (profileAvatar) profileAvatar.src = avatarUrl;

            const drawerAvatar = document.getElementById('drawer-avatar-img');
            const drawerName = document.getElementById('drawer-name');
            const drawerRole = document.getElementById('drawer-role');
            if (drawerAvatar) drawerAvatar.src = avatarUrl;
            if (drawerName) drawerName.textContent = usuario.nickname;
            if (drawerRole) drawerRole.textContent = usuario.cargo || 'Membro';

            document.getElementById('profile-info-nick').textContent = usuario.nickname;
            document.getElementById('profile-info-cargo-executivo').textContent = usuario.cargo_executivo || 'Não definido';
            document.getElementById('profile-info-cargo').textContent = usuario.cargo || 'Membro';

            const avAvaliador = document.getElementById('av-avaliador');
            if (avAvaliador) avAvaliador.value = usuario.nickname;
            const sindicanteNick = document.getElementById('sindicante-nick');
            if (sindicanteNick) sindicanteNick.value = usuario.nickname;
            const ouvAutor = document.getElementById('ouv-autor');
            if (ouvAutor) ouvAutor.value = usuario.nickname;

            const dataHoje = new Date().toLocaleDateString('pt-BR');
            document.getElementById('av-data').value = dataHoje;

            atualizarVisibilidadeAdmin();
            carregarAtividades();
            carregarNotificacoes();
            carregarBloqueios();
            carregarHorarios();
            carregarSolicitacoesAdmin();
            carregarMembros();
            carregarLogs();
            carregarDiasSelect();
            carregarLinks();
            iniciarAtualizacaoEmTempoReal();

            const ultimaPagina = sessionStorage.getItem('ultimaPagina') || 'home';
            switchPage(ultimaPagina);

            mostrarToast('Bem-vindo', `Login realizado como ${usuario.nickname}`, 'success');
        }

        function iniciarAtualizacaoEmTempoReal() {
            if (intervaloAtualizacao) clearInterval(intervaloAtualizacao);
            intervaloAtualizacao = setInterval(verificarAtualizacoesEmTempoReal, INTERVALO_ATUALIZACAO);
        }

        async function verificarAtualizacoesEmTempoReal() {
            try {
                const response = await fetch(`${SUPABASE_URL}/rest/v1/dados_sistema?select=*`, {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': 'Bearer ' + SUPABASE_KEY
                    },
                    cache: 'no-store'
                });

                if (response.ok) {
                    const dadosArray = await response.json();
                    if (dadosArray && dadosArray.length > 0) {
                        const novosDados = dadosArray[0].conteudo;

                        const bloqueiosAntigos = { ...paginaBloqueada };
                        const novosBloqueios = novosDados.bloqueios || [];
                        
                        let novoEstadoColeta = false;
                        let novoEstadoAvMensal = false;
                        
                        novosBloqueios.forEach(b => {
                            if (b.pagina === 'coleta') novoEstadoColeta = b.bloqueado;
                            if (b.pagina === 'av-mensal') novoEstadoAvMensal = b.bloqueado;
                        });
                        
                        if (novoEstadoColeta !== bloqueiosAntigos.coleta) {
                            paginaBloqueada.coleta = novoEstadoColeta;
                            const nomePagina = 'Coleta de Horários';
                            const acao = novoEstadoColeta ? 'fechada' : 'aberta';
                            criarNotificacao('*', 'Atualização de página', `A página ${nomePagina} foi ${acao}.`, novoEstadoColeta ? 'warning' : 'success');
                            atualizarBotoesToggle('coleta', novoEstadoColeta);
                            
                            const pageAtual = document.querySelector('.page.active')?.id;
                            if (pageAtual && pageAtual === 'page-coleta-horarios') {
                                verificarBloqueioPagina('coleta-horarios');
                            }
                        }
                        
                        if (novoEstadoAvMensal !== bloqueiosAntigos.avMensal) {
                            paginaBloqueada.avMensal = novoEstadoAvMensal;
                            const nomePagina = 'Formulário';
                            const acao = novoEstadoAvMensal ? 'fechado' : 'aberto';
                            criarNotificacao('*', 'Atualização de página', `O ${nomePagina} foi ${acao}.`, novoEstadoAvMensal ? 'warning' : 'success');
                            atualizarBotoesToggle('av-mensal', novoEstadoAvMensal);
                            
                            const pageAtual = document.querySelector('.page.active')?.id;
                            if (pageAtual && pageAtual === 'page-form-av-mensal') {
                                verificarBloqueioPagina('form-av-mensal');
                            }
                        }

                        DADOS = novosDados;
                        carregarHorarios();
                        carregarAtividades();
                        carregarNotificacoes();
                        carregarLinks();
                        
                        if (verificarPermissaoAdmin()) {
                            carregarSolicitacoesAdmin();
                            carregarMembros();
                            carregarLogs();
                        }
                        
                        atualizarBadgeNotificacoes();
                    }
                }
            } catch (error) {
                console.error('Erro na atualização em tempo real:', error);
            }
        }

        function atualizarBotoesToggle(pagina, bloqueado) {
            if (pagina === 'coleta') {
                const btnAberto = document.getElementById('btn-coleta-aberto');
                const btnFechado = document.getElementById('btn-coleta-fechado');
                if (btnAberto && btnFechado) {
                    btnAberto.classList.toggle('active', !bloqueado);
                    btnFechado.classList.toggle('active', bloqueado);
                }
            } else if (pagina === 'av-mensal') {
                const btnAberto = document.getElementById('btn-av-aberto');
                const btnFechado = document.getElementById('btn-av-fechado');
                if (btnAberto && btnFechado) {
                    btnAberto.classList.toggle('active', !bloqueado);
                    btnFechado.classList.toggle('active', bloqueado);
                }
            }
        }

        async function togglePagina(pagina, aberto) {
            if (!verificarPermissaoAdmin()) {
                mostrarToast('Acesso negado', 'Apenas administradores podem alterar isso', 'error');
                return;
            }
            
            const bloqueado = !aberto;
            
            if (!DADOS.bloqueios) DADOS.bloqueios = [];
            
            const index = DADOS.bloqueios.findIndex(b => b.pagina === pagina);
            if (index !== -1) {
                DADOS.bloqueios[index].bloqueado = bloqueado;
                DADOS.bloqueios[index].atualizado_em = new Date().toISOString();
            } else {
                DADOS.bloqueios.push({
                    pagina: pagina,
                    bloqueado: bloqueado,
                    atualizado_em: new Date().toISOString()
                });
            }
            
            paginaBloqueada[pagina] = bloqueado;
            
            await registrarLog('pagina', 'bloqueio_atualizado', usuarioEncontrado.nickname, { 
                pagina: pagina,
                status: bloqueado ? 'bloqueado' : 'liberado'
            });
            
            await salvarDados();
            
            const pageAtual = document.querySelector('.page.active')?.id;
            if (pageAtual && pageAtual === `page-${pagina === 'coleta' ? 'coleta-horarios' : 'form-av-mensal'}`) {
                verificarBloqueioPagina(pagina === 'coleta' ? 'coleta-horarios' : 'form-av-mensal');
            }

            const nomePagina = pagina === 'coleta' ? 'Coleta de Horários' : 'Formulário';
            const acao = bloqueado ? 'fechada' : 'aberta';
            criarNotificacao('*', 'Atualização de página', `A página ${nomePagina} foi ${acao}.`, bloqueado ? 'warning' : 'success');
            
            atualizarBotoesToggle(pagina, bloqueado);
        }

        async function carregarBloqueios() {
            const bloqueios = DADOS.bloqueios || [];
            paginaBloqueada.coleta = false;
            paginaBloqueada.avMensal = false;
            
            bloqueios.forEach(b => {
                if (b.pagina === 'coleta') {
                    paginaBloqueada.coleta = b.bloqueado;
                } else if (b.pagina === 'av-mensal') {
                    paginaBloqueada.avMensal = b.bloqueado;
                }
            });
            
            atualizarBotoesToggle('coleta', paginaBloqueada.coleta);
            atualizarBotoesToggle('av-mensal', paginaBloqueada.avMensal);
        }

        function mostrarMensagem(tipo, texto) {
            const msg = document.getElementById('login-message');
            if (!msg) return;
            msg.className = `login-message ${tipo}`;
            msg.textContent = texto;
            msg.style.display = 'block';
        }

        function fecharTodosDropdowns() {
            document.querySelectorAll('.dropdown-content.show').forEach(d => d.classList.remove('show'));
            document.querySelectorAll('.menu-item.has-dropdown.open').forEach(m => m.classList.remove('open'));
        }

        function toggleDropdown(event, dropdownId) {
            event.stopPropagation();
            const dropdown = document.getElementById(dropdownId);
            const menuItem = event.currentTarget;
            
            if (dropdown.classList.contains('show')) {
                dropdown.classList.remove('show');
                menuItem.classList.remove('open');
            } else {
                fecharTodosDropdowns();
                dropdown.classList.add('show');
                menuItem.classList.add('open');
            }
        }

        document.addEventListener('click', function(event) {
            if (!event.target.closest('.menu-item.has-dropdown')) {
                fecharTodosDropdowns();
            }

            if (window.innerWidth > 1024) {
                const notifCard = document.getElementById('notif-card');
                const notifDropdown = document.getElementById('notif-dropdown');
                if (!notifCard?.contains(event.target) && !notifDropdown?.contains(event.target)) {
                    notifDropdown?.classList.remove('show');
                }
            }
        });

        window.addEventListener('popstate', function() {
            fecharNotificacoesFullscreen();
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                fecharNotificacoesFullscreen();
            }
        });

        function switchPage(pageId) {
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            const page = document.getElementById(`page-${pageId}`);
            if (page) page.classList.add('active');

            sessionStorage.setItem('ultimaPagina', pageId);
            
            document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
            const menuItem = Array.from(document.querySelectorAll('.menu-item')).find(item => item.textContent.trim() === 
                (pageId === 'home' ? 'Home' : 
                pageId === 'atividades' ? 'Atividades' :
                pageId === 'ouvidoria' ? 'Ouvidoria' :
                pageId === 'admin' ? 'Painel' : ''));
            if (menuItem) menuItem.classList.add('active');
            
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
                    carregarSolicitacoesAdmin();
                    carregarMembros();
                    carregarLogs();
                    carregarDiasSelect();
                    carregarLinks();
                }
                if (pageId === 'atividades') carregarAtividades();
                if (pageId === 'coleta-horarios') {
                    carregarHorarios();
                    initHorariosGrid();
                }
                if (pageId === 'profile') {
                    document.getElementById('profile-info-nick').textContent = usuarioEncontrado.nickname;
                    document.getElementById('profile-info-cargo-executivo').textContent = usuarioEncontrado.cargo_executivo || 'Não definido';
                    document.getElementById('profile-info-cargo').textContent = usuarioEncontrado.cargo;
                    carregarEstatisticasPerfil();
                }
            }
            closeDrawer();
            fecharTodosDropdowns();
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
            
            if (avaliados.length === 0) {
                mostrarToast('Erro', 'Adicione pelo menos um avaliado', 'error');
                return;
            }
            
            mostrarToast('Avaliação enviada', `Avaliação mensal de ${avaliados.length} executivos registrada`, 'success');
        }

        function switchSindicanciaTab(tab) {
            document.querySelectorAll('.sindicancia-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.sindicancia-form').forEach(f => f.classList.remove('active'));
            const forms = document.getElementById(`sindicancia-form-${tab}`);
            const tabs = document.querySelectorAll('.sindicancia-tab');
            const tabIndex = ['avaliacao-mensal', 'avanco-indeferida', 'regresso-especializacao'].indexOf(tab);
            if (tabs[tabIndex]) tabs[tabIndex].classList.add('active');
            if (forms) forms.classList.add('active');
        }

        function enviarSindicancia(tipo) {
            mostrarToast('Sindicância enviada', `Sindicância de ${tipo} registrada com sucesso`, 'success');
        }

        function handleOuvidoriaSubmit(e) {
            e.preventDefault();
            const tipoSelecionado = document.querySelector('#checkbox-group-container input:checked')?.value;
            if (!tipoSelecionado) {
                mostrarToast('Erro', 'Selecione um tipo de proposta', 'error');
                return;
            }
            mostrarToast('Proposta enviada', 'Sua proposta foi registrada na ouvidoria', 'success');
            document.getElementById('ouv-sintese').value = '';
            document.getElementById('ouv-desenvolvimento').value = '';
            document.getElementById('ouv-ordem').value = '';
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

        function toggleMembroSelecionado(nickname, element) {
            if (membrosSelecionados.has(nickname)) {
                membrosSelecionados.delete(nickname);
                element.classList.remove('checked');
            } else {
                membrosSelecionados.add(nickname);
                element.classList.add('checked');
            }
            
            const bulkActions = document.getElementById('membro-bulk-actions');
            if (bulkActions) {
                bulkActions.style.display = membrosSelecionados.size > 0 ? 'flex' : 'none';
            }
        }

        async function aplicarCargoSelecionados() {
            const cargo = document.getElementById('bulk-cargo-select').value;
            if (!cargo) {
                mostrarToast('Erro', 'Selecione um cargo para aplicar', 'error');
                return;
            }
            
            for (const nick of membrosSelecionados) {
                const index = DADOS.usuarios?.findIndex(u => u.nickname === nick);
                if (index !== -1) {
                    DADOS.usuarios[index].cargo = cargo;
                }
            }
            
            await registrarLog('usuario', 'cargo_em_lote', usuarioEncontrado.nickname, { 
                usuarios: Array.from(membrosSelecionados), 
                cargo 
            });
            
            await salvarDados();
            
            membrosSelecionados.clear();
            document.getElementById('membro-bulk-actions').style.display = 'none';
            document.getElementById('bulk-cargo-select').value = '';
            
            carregarMembros();
            atualizarVisibilidadeAdmin();
            mostrarToast('Cargos atualizados', `Cargo aplicado a ${membrosSelecionados.size} membros`, 'success');
        }

        async function removerSelecionados() {
            if (!confirm(`Tem certeza que deseja remover ${membrosSelecionados.size} membro(s)?`)) return;
            
            DADOS.usuarios = DADOS.usuarios.filter(u => !membrosSelecionados.has(u.nickname));
            DADOS.solicitacoes = (DADOS.solicitacoes || []).filter(s => !membrosSelecionados.has(s.nickname));
            
            await registrarLog('usuario', 'remocao_em_lote', usuarioEncontrado.nickname, { 
                usuarios: Array.from(membrosSelecionados) 
            });
            
            await salvarDados();
            
            membrosSelecionados.clear();
            document.getElementById('membro-bulk-actions').style.display = 'none';
            
            carregarMembros();
            carregarSolicitacoesAdmin();
            mostrarToast('Membros removidos', 'Os membros selecionados foram removidos', 'success');
        }

        async function carregarSolicitacoesAdmin() {
            if (!verificarPermissaoAdmin()) return;
            
            const container = document.getElementById('admin-solicitacoes');
            if (!container) return;
            
            const solicitacoes = (DADOS.solicitacoes || []).filter(s => s.status === 'pendente');
            
            if (solicitacoes.length === 0) {
                container.innerHTML = '<p style="color: #888; text-align: center; padding: 10px;">Nenhuma solicitação pendente.</p>';
                return;
            }
            
            container.innerHTML = solicitacoes.sort((a, b) => new Date(b.data_solicitacao) - new Date(a.data_solicitacao)).map(s => `
                <div class="solicitacao-card" style="padding: 8px; margin-bottom: 5px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: #85e300; font-weight: 600; font-size: 12px;">${s.nickname}</span>
                        <span style="font-size: 9px; color: #888;">${new Date(s.data_solicitacao).toLocaleString('pt-BR')}</span>
                    </div>
                    <div style="font-size: 10px; margin: 3px 0; color: #ccc;">${s.motivo || 'Sem motivo'}</div>
                    <div style="display: flex; gap: 3px;">
                        <button class="btn-aprovar" style="padding: 3px 6px; font-size: 9px;" onclick="processarSolicitacao('${s.nickname}', 'aprovada')">Aprovar</button>
                        <button class="btn-rejeitar" style="padding: 3px 6px; font-size: 9px;" onclick="processarSolicitacao('${s.nickname}', 'rejeitada')">Rejeitar</button>
                    </div>
                </div>
            `).join('');
        }

        async function processarSolicitacao(nick, status) {
            if (!verificarPermissaoAdmin()) return;
            
            let justificativa = '';
            if (status === 'rejeitada') {
                justificativa = prompt('Digite o motivo da rejeição:');
                if (!justificativa) {
                    mostrarToast('Cancelado', 'É necessário informar um motivo para rejeitar', 'warning');
                    return;
                }
            }
            
            const solicitacaoIndex = DADOS.solicitacoes?.findIndex(s => s.nickname === nick && s.status === 'pendente');
            if (solicitacaoIndex !== -1) {
                DADOS.solicitacoes[solicitacaoIndex].status = status;
                DADOS.solicitacoes[solicitacaoIndex].justificativa = justificativa;
                DADOS.solicitacoes[solicitacaoIndex].processado_por = usuarioEncontrado.nickname;
                DADOS.solicitacoes[solicitacaoIndex].data_processamento = new Date().toISOString();
            }
            
            const usuarioIndex = DADOS.usuarios?.findIndex(u => u.nickname === nick);
            if (usuarioIndex !== -1) {
                DADOS.usuarios[usuarioIndex].status = status === 'aprovada' ? 'aprovado' : 'rejeitado';
            }
            
            await registrarLog('usuario', `solicitacao_${status}`, usuarioEncontrado.nickname, { alvo: nick, justificativa });
            
            await criarNotificacao(nick, 
                status === 'aprovada' ? 'Acesso aprovado' : 'Acesso negado',
                status === 'aprovada' ? 'Sua solicitação de acesso foi aprovada. Faça login novamente.' : `Sua solicitação de acesso foi negada. Motivo: ${justificativa}`,
                status === 'aprovada' ? 'success' : 'error'
            );
            
            await salvarDados();
            
            mostrarToast('Solicitação processada', `Acesso ${status === 'aprovada' ? 'aprovado' : 'rejeitado'} para ${nick}`, 'success');
            carregarSolicitacoesAdmin();
            carregarMembros();
        }

        async function criarNotificacao(usuarioNick, titulo, mensagem, tipo = 'info') {
            if (!DADOS.notificacoes) DADOS.notificacoes = [];
            
            if (usuarioNick === '*') {
                const usuarios = DADOS.usuarios?.filter(u => u.status === 'aprovado') || [];
                for (const user of usuarios) {
                    DADOS.notificacoes.push({
                        id: Date.now() + Math.random(),
                        usuario_nick: user.nickname,
                        titulo: titulo,
                        mensagem: mensagem,
                        tipo: tipo,
                        lida: false,
                        data_criacao: new Date().toISOString()
                    });
                }
            } else {
                DADOS.notificacoes.push({
                    id: Date.now() + Math.random(),
                    usuario_nick: usuarioNick,
                    titulo: titulo,
                    mensagem: mensagem,
                    tipo: tipo,
                    lida: false,
                    data_criacao: new Date().toISOString()
                });
            }
            
            await salvarDados();
            
            if (usuarioNick === usuarioEncontrado?.nickname || usuarioNick === '*') {
                carregarNotificacoes();
            }
            
            if (usuarioNick === '*' && usuarioEncontrado) {
                mostrarToast(titulo, mensagem, tipo);
            }
        }

        async function carregarNotificacoes() {
            if (!usuarioEncontrado?.nickname) return;
            
            const notificacoes = (DADOS.notificacoes || []).filter(n => n.usuario_nick === usuarioEncontrado.nickname);
            
            notificacoesNaoLidas = notificacoes.filter(n => !n.lida).length;
            renderNotificacoes(notificacoes);
            atualizarBadgeNotificacoes();
        }

        async function marcarNotificacaoLida(id) {
            try {
                const notifId = typeof id === 'string' ? parseFloat(id) : id;
                
                const index = DADOS.notificacoes?.findIndex(n => n.id === notifId);
                if (index !== -1 && !DADOS.notificacoes[index].lida) {
                    DADOS.notificacoes[index].lida = true;
                    DADOS.notificacoes[index].data_leitura = new Date().toISOString();
                    await salvarDados();
                    carregarNotificacoes();
                    renderNotificacoesFullscreen();
                }
            } catch (error) {
                console.error('Erro ao marcar notificação como lida:', error);
            }
        }

        async function deletarNotificacao(id) {
            try {
                const notifId = typeof id === 'string' ? parseFloat(id) : id;
                
                if (!DADOS.notificacoes) return;
                
                DADOS.notificacoes = DADOS.notificacoes.filter(n => n.id !== notifId);
                
                await salvarDados();
                carregarNotificacoes();
                renderNotificacoesFullscreen();
                
                mostrarToast('Apagada', 'Mensagem excluída com sucesso', 'success');
            } catch (error) {
                console.error('Erro ao deletar notificação:', error);
            }
        }

        async function marcarTodasLidas() {
            if (!DADOS.notificacoes || !usuarioEncontrado) return;
            
            let mudou = false;
            const notificacoesUsuario = DADOS.notificacoes.filter(n => n.usuario_nick === usuarioEncontrado.nickname);
            const naoLidas = notificacoesUsuario.filter(n => !n.lida);
            
            if (naoLidas.length === 0) {
                mostrarToast('Sem notificações', 'Não há mensagens não lidas', 'info');
                return;
            }
            
            DADOS.notificacoes.forEach(n => {
                if (!n.lida && n.usuario_nick === usuarioEncontrado.nickname) {
                    n.lida = true;
                    n.data_leitura = new Date().toISOString();
                    mudou = true;
                }
            });
            
            if (mudou) {
                await salvarDados();
                await registrarLog('notificacao', 'marcar_todas_lidas', usuarioEncontrado.nickname);
                carregarNotificacoes();
                renderNotificacoesFullscreen();
                mostrarToast('Sucesso', `${naoLidas.length} notificação(ões) marcada(s) como lida(s)`, 'success');
            }
        }

        async function carregarMembros() {
            if (!verificarPermissaoAdmin()) return;
            
            const container = document.getElementById('membros-lista');
            if (!container) return;
            
            const membros = DADOS.usuarios || [];
            
            if (membros.length === 0) {
                container.innerHTML = '<p style="color: #888; text-align: center; padding: 10px;">Nenhum membro encontrado.</p>';
                return;
            }
            
            container.innerHTML = membros.map(m => {
                const cargoAtual = alteracoesCargos[m.nickname] !== undefined ? alteracoesCargos[m.nickname] : m.cargo;
                
                return `
                    <div class="membro-item">
                        <div class="membro-info">
                            <div class="membro-checkbox">
                                <div id="checkbox-${m.nickname}" class="checkbox-membro" onclick="toggleMembroSelecionado('${m.nickname}', this)"></div>
                            </div>
                            <span style="font-weight: 600;">${m.nickname}</span>
                            <span class="membro-cargo-badge ${cargoAtual === 'Admin' ? 'admin' : cargoAtual === 'DEV' ? 'dev' : 'membro'}">${cargoAtual || 'Membro'}</span>
                        </div>
                        <div class="membro-actions">
                            <select class="cargo-select" onchange="alterarCargoMembro('${m.nickname}', this.value)">
                                <option value="Membro" ${cargoAtual === 'Membro' ? 'selected' : ''}>Membro</option>
                                <option value="Admin" ${cargoAtual === 'Admin' ? 'selected' : ''}>Admin</option>
                                <option value="DEV" ${cargoAtual === 'DEV' ? 'selected' : ''}>DEV</option>
                            </select>
                        </div>
                    </div>
                `;
            }).join('');
        }

        async function alterarCargoMembro(nick, novoCargo) {
            if (!verificarPermissaoAdmin()) return;
            
            const index = DADOS.usuarios?.findIndex(u => u.nickname === nick);
            if (index !== -1) {
                alteracoesCargos[nick] = novoCargo;
                DADOS.usuarios[index].cargo = novoCargo;
                await registrarLog('usuario', 'alteracao_cargo', usuarioEncontrado.nickname, { alvo: nick, novoCargo });
                await salvarDados();
                carregarMembros();
                atualizarVisibilidadeAdmin();
                mostrarToast('Cargo alterado', `Cargo de ${nick} atualizado para ${novoCargo}`, 'success');
            }
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

        async function carregarAtividades() {
            const atividades = DADOS.atividades || [];
            
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
                    const atividadesDia = atividades.filter(a => a.data === dataStr);
                    const temAtividade = atividadesDia.length > 0;
                    const isToday = dia === hoje.getDate() ? 'today' : '';
                    
                    let statusIcon = '';
                    let statusClass = '';
                    
                    if (temAtividade) {
                        if (atividadesDia.some(a => a.status === 'pendente')) {
                            statusIcon = '!';
                            statusClass = 'pendente';
                        } else if (atividadesDia.some(a => a.status === 'em_andamento')) {
                            statusIcon = '...';
                            statusClass = 'em_andamento';
                        } else if (atividadesDia.some(a => a.status === 'concluido')) {
                            statusIcon = '✓';
                            statusClass = 'concluido';
                        }
                    }
                    
                    calendarHTML += `
                        <div class="calendar-day ${temAtividade ? 'has-event' : ''} ${statusClass} ${isToday}">
                            ${dia}
                            ${temAtividade ? `<span class="status-icon ${statusClass}">${statusIcon}</span>` : ''}
                        </div>
                    `;
                }
                calendarGrid.innerHTML = calendarHTML;
            }
            
            const eventList = document.getElementById('event-list');
            if (eventList) {
                const eventosOrdenados = [...atividades].sort((a, b) => new Date(a.data + 'T' + a.hora) - new Date(b.data + 'T' + b.hora));
                
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
                        <div class="event-item" id="evento-${e.id}">
                            <div class="event-date"><strong>${dataFormatada} - ${horaFormatada}</strong></div>
                            <div class="event-title">
                                ${e.titulo}
                                <span class="status-badge ${statusClass}">${statusTexto}</span>
                            </div>
                            <div class="event-description-preview" onclick="toggleDescricao('${e.id}')">
                                <i class="ph ph-caret-down"></i> Clique para ler a descrição
                            </div>
                            <div class="event-description-full" id="descricao-${e.id}">
                                ${e.descricao || 'Sem descrição.'}
                            </div>
                            <div class="event-meta">
                                <span>Por: ${e.criado_por || 'Sistema'}</span>
                            </div>
                            ${verificarPermissaoAdmin() && e.status !== 'concluido' ? `
                                <div class="event-actions">
                                    <button class="concluir" onclick="concluirAtividade('${e.id}')">Concluir</button>
                                </div>
                            ` : ''}
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
                const proximasAtividades = atividades.filter(a => a.status !== 'concluido' && new Date(`${a.data}T${a.hora}`) > agora).slice(0, 5);
                proximas.innerHTML = proximasAtividades.map(a => {
                    const dataHora = new Date(a.data + 'T' + a.hora);
                    const dataFormatada = dataHora.toLocaleDateString('pt-BR');
                    const horaFormatada = dataHora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                    return `
                        <div class="compact-card">
                            <div class="header">
                                <span class="titulo">${a.titulo}</span>
                                <span class="data">${dataFormatada} ${horaFormatada}</span>
                            </div>
                            ${a.descricao ? `<div class="descricao">${a.descricao.substring(0, 30)}${a.descricao.length > 30 ? '...' : ''}</div>` : ''}
                            <div class="footer">
                                <span class="status-indicator ${a.status}">${a.status.replace('_', ' ')}</span>
                                <span>${a.criado_por || 'Sistema'}</span>
                            </div>
                        </div>
                    `;
                }).join('') || '<p style="color: #888; font-size: 11px; padding: 10px;">Nenhuma atividade futura.</p>';
            }
            
            atualizarEstatisticas(atividades);
        }

        function toggleDescricao(id) {
            const desc = document.getElementById(`descricao-${id}`);
            if (desc) desc.classList.toggle('show');
        }

        async function concluirAtividade(id) {
            if (!verificarPermissaoAdmin()) {
                mostrarToast('Acesso negado', 'Apenas administradores podem concluir atividades', 'error');
                return;
            }
            
            const index = DADOS.atividades?.findIndex(a => a.id == id);
            if (index !== -1) {
                DADOS.atividades[index].status = 'concluido';
                await registrarLog('atividade', 'concluir_atividade', usuarioEncontrado.nickname, { atividade_id: id });
                await salvarDados();
                carregarAtividades();
                mostrarToast('Atividade concluída', 'A atividade foi marcada como concluída', 'success');
            }
        }

        function atualizarEstatisticas(atividades) {
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

            const hoje = new Date();
            const ano = hoje.getFullYear();
            const mes = hoje.getMonth();

            const dataObj = new Date(ano, mes, dia);
            const anoStr = dataObj.getFullYear();
            const mesStr = String(dataObj.getMonth() + 1).padStart(2, '0');
            const diaStr = String(dataObj.getDate()).padStart(2, '0');
            const dataFormatada = `${anoStr}-${mesStr}-${diaStr}`;

            if (!DADOS.atividades) DADOS.atividades = [];
            
            const novaAtividade = {
                id: Date.now() + Math.random(),
                titulo: titulo,
                descricao: descricao || '',
                data: dataFormatada,
                hora: hora,
                status: 'pendente',
                criado_por: usuarioEncontrado.nickname
            };
            
            DADOS.atividades.push(novaAtividade);

            await registrarLog('atividade', 'criacao_atividade', usuarioEncontrado.nickname, novaAtividade);

            await salvarDados();

            document.getElementById('atividade-titulo').value = '';
            document.getElementById('atividade-descricao').value = '';

            mostrarToast('Atividade criada', 'Atividade marcada com sucesso no calendário', 'success');

            await carregarAtividades();

            if (usuarioEncontrado) {
                await criarNotificacao('*', 'Nova atividade', `${usuarioEncontrado.nickname} acabou de marcar uma atividade. Confira!`, 'info');
            }
        }

        function toggleNotificacoes() {
            const isMobile = window.innerWidth <= 1024;
            
            if (isMobile) {
                const fullscreen = document.getElementById('notif-fullscreen');
                if (fullscreen) {
                    fullscreen.classList.add('active');
                    renderNotificacoesFullscreen();
                    document.body.style.overflow = 'hidden';
                }
            } else {
                const dropdown = document.getElementById('notif-dropdown');
                dropdown.classList.toggle('show');
            }
        }

        function fecharNotificacoesFullscreen() {
            document.getElementById('notif-fullscreen').classList.remove('active');
            document.body.style.overflow = '';
        }

        function renderNotificacoesFullscreen() {
            const container = document.getElementById('notif-fullscreen-content');
            if (!container || !usuarioEncontrado?.nickname) return;
            
            const notificacoes = (DADOS.notificacoes || [])
                .filter(n => n.usuario_nick === usuarioEncontrado.nickname)
                .sort((a, b) => new Date(b.data_criacao) - new Date(a.data_criacao));
            
            if (notificacoes.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 50px 20px; color: #888;">
                        <i class="ph ph-bell" style="font-size: 64px; margin-bottom: 20px; display: block;"></i>
                        <p style="font-size: 16px;">Nenhuma notificação</p>
                    </div>
                `;
                return;
            }
            
            container.innerHTML = notificacoes.map(n => {
                return `
                    <div class="notif-fullscreen-item ${!n.lida ? 'unread' : ''}" 
                        style="position: relative;">
                        <div class="notif-fullscreen-titulo">${n.titulo}</div>
                        <div class="notif-fullscreen-texto">${n.mensagem}</div>
                        <div class="notif-fullscreen-data">${new Date(n.data_criacao).toLocaleString('pt-BR')}</div>
                        <div class="notif-fullscreen-delete" onclick="event.stopPropagation(); deletarNotificacao('${n.id}')">
                            <i class="ph ph-trash"></i>
                        </div>
                        ${!n.lida ? `<div style="position: absolute; top: 15px; right: 45px; color: #85e300; font-size: 10px;">NOVA</div>` : ''}
                    </div>
                `;
            }).join('');
        }

        async function marcarTodasLidasMobile() {
            await marcarTodasLidas();
            renderNotificacoesFullscreen();
        }

        function renderNotificacoes(notificacoes) {
            const list = document.getElementById('notif-list');
            if (!list) return;
            
            if (notificacoes.length === 0) {
                list.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Nenhuma notificação</div>';
                return;
            }
            
            list.innerHTML = notificacoes.sort((a, b) => new Date(b.data_criacao) - new Date(a.data_criacao)).map(n => `
                <div class="notif-item ${!n.lida ? 'unread' : ''}" onclick="marcarNotificacaoLida('${n.id}')">
                    <div class="notif-titulo">${n.titulo}</div>
                    <div class="notif-texto">${n.mensagem}</div>
                    <div class="notif-data">${new Date(n.data_criacao).toLocaleString('pt-BR')}</div>
                    <div class="notif-delete" onclick="event.stopPropagation(); deletarNotificacao('${n.id}')"><i class="ph ph-trash"></i></div>
                </div>
            `).join('');
        }

        function atualizarBadgeNotificacoes() {
            const badge = document.getElementById('notif-badge');
            const mobileBadge = document.getElementById('mobile-notif-badge');
            if (notificacoesNaoLidas > 0) {
                badge.textContent = notificacoesNaoLidas;
                badge.style.display = 'flex';
                if (mobileBadge) {
                    mobileBadge.textContent = notificacoesNaoLidas;
                    mobileBadge.style.display = 'flex';
                }
            } else {
                badge.style.display = 'none';
                if (mobileBadge) mobileBadge.style.display = 'none';
            }
        }

        function preencherMeses() {
            const meses = [
                'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
            ];
            const mesSelect = document.getElementById('av-mes');
            const filterMes = document.getElementById('filter-mes');
            const linkMes = document.getElementById('link-mes');
            const hoje = new Date();
            const mesAtual = hoje.getMonth();
            
            if (mesSelect) {
                mesSelect.innerHTML = meses.map((m, i) => `<option value="${i+1}" ${i === mesAtual ? 'selected' : ''}>${m}</option>`).join('');
            }
            
            if (filterMes) {
                filterMes.innerHTML = '<option value="">Todos</option>' + meses.map((m, i) => `<option value="${i+1}">${m}</option>`).join('');
            }
            
            if (linkMes) {
                linkMes.innerHTML = meses.map((m, i) => `<option value="${i+1}">${m}</option>`).join('');
            }
            
            const filterAno = document.getElementById('filter-ano');
            if (filterAno) {
                const anoAtual = hoje.getFullYear();
                filterAno.innerHTML = `<option value="${anoAtual}">${anoAtual}</option><option value="${anoAtual-1}">${anoAtual-1}</option>`;
            }
        }

        function preencherDetalhamentos() {
            const detalhamentos = [
                'Nota atribuída', 'Atraso na avaliação', 'Critério de avaliação',
                'Falta de feedback', 'Outros'
            ];
            const select1 = document.getElementById('sin-av-mensal-detalhamento');
            const select2 = document.getElementById('sin-avanco-detalhamento');
            
            if (select1) {
                select1.innerHTML = detalhamentos.map(d => `<option value="${d}">${d}</option>`).join('');
            }
            if (select2) {
                select2.innerHTML = detalhamentos.map(d => `<option value="${d}">${d}</option>`).join('');
            }
        }

        function preencherCheckboxes() {
            const container = document.getElementById('checkbox-group-container');
            if (!container) return;
            const tipos = ['Projeto', 'Sugestão', 'Correção'];
            container.innerHTML = tipos.map(t => `
                <label class="checkbox-item">
                    <input type="checkbox" value="${t.toLowerCase()}">
                    <span class="label-text">${t}</span>
                </label>
            `).join('');
        }

        function carregarLinks() {
            const container = document.getElementById('links-container');
            if (!container) return;
            
            const links = DADOS.links || [];
            
            if (links.length === 0) {
                container.innerHTML = '<p style="color: #888; font-size: 11px; text-align: center;">Nenhum link adicionado.</p>';
                return;
            }
            
            container.innerHTML = links.sort((a, b) => b.mes - a.mes).map(l => `
                <div class="link-item">
                    <div class="link-info">
                        <div class="link-mes">Mês ${l.mes}/${l.ano || new Date().getFullYear()}</div>
                        <div class="link-url"><a href="${l.url}" target="_blank">${l.url.length > 30 ? l.url.substring(0, 30) + '...' : l.url}</a></div>
                        <div style="font-size: 9px; color: #888;">${l.descricao || 'Resultado da avaliação mensal.'}</div>
                    </div>
                    <div class="link-actions">
                        ${verificarPermissaoAdmin() ? `
                            <button class="btn-remover-pequeno" onclick="removerLink('${l.id}')"><i class="ph ph-trash"></i></button>
                        ` : ''}
                    </div>
                </div>
            `).join('');
            
            const cardsAv = document.getElementById('avs-cards');
            if (cardsAv) {
                cardsAv.innerHTML = links.map(l => `
                    <a href="${l.url}" target="_blank" class="card-link">
                        <div class="card-header">
                            <span class="card-title">Mês ${l.mes}/${l.ano || new Date().getFullYear()}</span>
                            <span class="card-date">${new Date(l.data_criacao || Date.now()).toLocaleDateString('pt-BR')}</span>
                        </div>
                        <div class="card-content">
                            ${l.descricao || 'Resultado da avaliação mensal.'}
                        </div>
                        <div class="card-author">
                            Por: ${l.criado_por || 'Sistema'}
                        </div>
                    </a>
                `).join('') || '<div class="empty-state"><i class="ph ph-link"></i><p>Nenhum link adicionado.</p></div>';
            }
        }

        async function adicionarLink() {
            if (!verificarPermissaoAdmin()) return;
            
            const mes = document.getElementById('link-mes')?.value;
            const url = document.getElementById('link-url')?.value.trim();
            
            if (!mes || !url) {
                mostrarToast('Erro', 'Selecione o mês e digite a URL', 'error');
                return;
            }
            
            if (!DADOS.links) DADOS.links = [];
            
            const novoLink = {
                id: Date.now() + Math.random(),
                mes: parseInt(mes),
                ano: new Date().getFullYear(),
                url: url,
                descricao: 'Resultado da avaliação mensal.',
                criado_por: usuarioEncontrado.nickname,
                data_criacao: new Date().toISOString()
            };
            
            DADOS.links.push(novoLink);
            
            await registrarLog('link', 'adicao_link', usuarioEncontrado.nickname, novoLink);
            
            await salvarDados();
            
            document.getElementById('link-url').value = '';
            
            carregarLinks();
            
            mostrarToast('Link adicionado', 'O link foi adicionado ao Registro das AVs', 'success');
        }

        async function removerLink(id) {
            if (!verificarPermissaoAdmin()) return;
            
            if (!confirm('Tem certeza que deseja remover este link?')) return;
            
            DADOS.links = (DADOS.links || []).filter(l => l.id != id);
            
            await registrarLog('link', 'remocao_link', usuarioEncontrado.nickname, { link_id: id });
            
            await salvarDados();
            
            carregarLinks();
            
            mostrarToast('Link removido', 'O link foi removido com sucesso', 'success');
        }

        async function enviarSolicitacao() {
            const nick = document.getElementById('solicitacao-nick')?.textContent;
            const motivo = document.getElementById('motivo-solicitacao')?.value || '';
            
            if (!nick) return;
            
            const usuarioIndex = DADOS.usuarios?.findIndex(u => u.nickname === nick);
            if (usuarioIndex !== -1) {
                DADOS.usuarios[usuarioIndex].status = 'pendente';
            } else {
                if (!DADOS.usuarios) DADOS.usuarios = [];
                DADOS.usuarios.push({
                    nickname: nick,
                    cargo: 'Membro',
                    status: 'pendente',
                    data_registro: new Date().toISOString()
                });
            }
            
            if (!DADOS.solicitacoes) DADOS.solicitacoes = [];
            DADOS.solicitacoes.push({
                id: Date.now() + Math.random(),
                nickname: nick,
                motivo: motivo,
                status: 'pendente',
                data_solicitacao: new Date().toISOString()
            });
            
            await salvarDados();
            
            document.getElementById('btn-solicitar').disabled = true;
            document.getElementById('btn-solicitar').textContent = 'Aguardando aprovação';
            document.getElementById('mensagem-aguarde').style.display = 'block';
            mostrarMensagem('info', 'Solicitação enviada. Aguarde aprovação.');
            
            mostrarToast('Solicitação enviada', 'Sua solicitação de acesso foi registrada', 'success');
        }

        async function confirmarLogin() {
            if (!usuarioEncontrado) return;
            
            if (!verificarUsuarioAutorizado(usuarioEncontrado.nickname)) {
                mostrarToast('Acesso negado', 'Usuário não autorizado', 'error');
                setTimeout(() => location.reload(), 2000);
                return;
            }
            
            const cargoSelect = document.getElementById('login-cargo-executivo');
            const isPrimeiroLogin = cargoSelect.style.display !== 'none';
            
            let cargoExecutivo = usuarioEncontrado.cargo_executivo;
            
            if (isPrimeiroLogin) {
                cargoExecutivo = cargoSelect.value;
                if (!cargoExecutivo) {
                    mostrarMensagem('error', 'Selecione seu cargo executivo');
                    return;
                }
            }
            
            const index = DADOS.usuarios.findIndex(u => u.nickname === usuarioEncontrado.nickname);
            if (index !== -1) {
                DADOS.usuarios[index].cargo_executivo = cargoExecutivo;
                DADOS.usuarios[index].cargo_executivo_alterado = false;
                DADOS.usuarios[index].primeiro_login = false;
                usuarioEncontrado.cargo_executivo = cargoExecutivo;
            }

            const ultimaPagina = sessionStorage.getItem('ultimaPagina') || 'home';
            
            sessionStorage.setItem('usuario', JSON.stringify({
                nickname: usuarioEncontrado.nickname,
                cargo: usuarioEncontrado.cargo,
                cargo_executivo: cargoExecutivo,
                cargo_executivo_alterado: false,
                primeiro_login: false,
                avatar: document.getElementById('login-avatar')?.src || '',
                ultimaPagina: ultimaPagina
            }));
            
            await registrarLog('login', 'login', usuarioEncontrado.nickname, { cargo: usuarioEncontrado.cargo, cargo_executivo: cargoExecutivo });
            
            mostrarToast('Acesso liberado!', 'Redirecionando em 3 segundos...', 'success');
            
            setTimeout(() => {
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
                
                const profileAvatar = document.getElementById('profile-avatar-img');
                if (profileAvatar) profileAvatar.src = document.getElementById('login-avatar')?.src || '';
                
                document.getElementById('profile-info-nick').textContent = usuarioEncontrado.nickname;
                document.getElementById('profile-info-cargo-executivo').textContent = cargoExecutivo;
                document.getElementById('profile-info-cargo').textContent = usuarioEncontrado.cargo;
                
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
                
                const dataHoje = new Date().toLocaleDateString('pt-BR');
                document.getElementById('av-data').value = dataHoje;
                
                atualizarVisibilidadeAdmin();
                carregarAtividades();
                carregarNotificacoes();
                carregarBloqueios();
                carregarHorarios();
                carregarSolicitacoesAdmin();
                carregarMembros();
                carregarLogs();
                carregarDiasSelect();
                carregarLinks();
                iniciarAtualizacaoEmTempoReal();

                switchPage(ultimaPagina);
                
                mostrarToast('Bem-vindo', `Login realizado como ${usuarioEncontrado.nickname}`, 'success');
            }, 3000);
        }

        function init() {
            const usuarioSalvo = sessionStorage.getItem('usuario');
            if (usuarioSalvo) {
                try {
                    const userData = JSON.parse(usuarioSalvo);
                    
                    if (!verificarUsuarioAutorizado(userData.nickname)) {
                        sessionStorage.removeItem('usuario');
                        return;
                    }
                    
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
                    
                    const profileAvatar = document.getElementById('profile-avatar-img');
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
                    
                    const dataHoje = new Date().toLocaleDateString('pt-BR');
                    document.getElementById('av-data').value = dataHoje;
                    
                    document.getElementById('login-overlay').style.display = 'none';
                    
                    usuarioEncontrado = {
                        nickname: userData.nickname,
                        cargo: userData.cargo,
                        cargo_executivo: userData.cargo_executivo,
                        cargo_executivo_alterado: userData.cargo_executivo_alterado
                    };
                    
                    document.getElementById('profile-info-nick').textContent = userData.nickname;
                    document.getElementById('profile-info-cargo-executivo').textContent = userData.cargo_executivo || 'Não definido';
                    document.getElementById('profile-info-cargo').textContent = userData.cargo;
                    
                    atualizarVisibilidadeAdmin();
                    carregarDados().then(() => {
                        carregarNotificacoes();
                        carregarBloqueios();
                        carregarHorarios();
                        carregarAtividades();
                        carregarSolicitacoesAdmin();
                        carregarMembros();
                        carregarLogs();
                        carregarLinks();
                        preencherMeses();
                        preencherDetalhamentos();
                        preencherCheckboxes();
                        carregarDiasSelect();
                        iniciarAtualizacaoEmTempoReal();

                        const ultimaPagina = userData.ultimaPagina || sessionStorage.getItem('ultimaPagina') || 'home';
                        switchPage(ultimaPagina);
                    });
                } catch (e) {
                    console.error('Erro ao carregar usuário salvo:', e);
                    sessionStorage.removeItem('usuario');
                }
            }
            setupEventListeners();
            preencherMeses();
            preencherDetalhamentos();
            preencherCheckboxes();
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
        }

        document.addEventListener('DOMContentLoaded', () => {
            init();
            initLogin();
        });
