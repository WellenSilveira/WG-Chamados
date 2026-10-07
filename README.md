# WG Chamados

Sistema desktop de **helpdesk e inventário de TI**, com funcionamento **offline** e banco local. Permite abrir, distribuir e acompanhar chamados, controlar prazos de atendimento (SLA) e manter um registro de auditoria das ações.

## Capturas de tela

As imagens abaixo mostram as telas do aplicativo com dados fictícios.

### Acesso

| Configurar administrador | Login |
|---|---|
| ![Configurar administrador](docs/screenshots/01-configurar-administrador.png) | ![Login](docs/screenshots/02-login.png) |

| Cadastro |
|---|
| ![Cadastro](docs/screenshots/03-cadastro.png) |

### Administrador

| Dashboard | Chamados |
|---|---|
| ![Dashboard do administrador](docs/screenshots/04-admin-dashboard.png) | ![Chamados do administrador](docs/screenshots/05-admin-chamados.png) |

| Abrir chamado | Histórico |
|---|---|
| ![Abrir chamado pelo administrador](docs/screenshots/06-admin-abrir-chamado.png) | ![Histórico do administrador](docs/screenshots/07-admin-historico.png) |

| Usuários | Inventário |
|---|---|
| ![Usuários](docs/screenshots/08-admin-usuarios.png) | ![Inventário](docs/screenshots/09-admin-inventario.jpg) |

| Relatórios | Auditoria |
|---|---|
| ![Relatórios](docs/screenshots/10-admin-relatorios.jpg) | ![Auditoria](docs/screenshots/11-admin-auditoria.png) |

| Configurações | Notificações |
|---|---|
| ![Configurações](docs/screenshots/12-admin-configuracoes.jpg) | ![Notificações do administrador](docs/screenshots/12-admin-notificacoes.jpg) |

| Meu perfil |
|---|
| ![Perfil do administrador](docs/screenshots/13-admin-perfil.png) |

### Resolutor

| Dashboard | Chamados |
|---|---|
| ![Dashboard do resolutor](docs/screenshots/14-resolutor-dashboard.jpg) | ![Chamados do resolutor](docs/screenshots/15-resolutor-chamados.jpg) |

| Notificações | Meu perfil |
|---|---|
| ![Notificações do resolutor](docs/screenshots/16-resolutor-notificacoes.jpg) | ![Perfil do resolutor](docs/screenshots/17-resolutor-perfil.jpg) |

### Usuário comum

| Meus chamados | Abrir chamado |
|---|---|
| ![Chamados do usuário](docs/screenshots/16-usuario-chamados.jpg) | ![Abrir chamado pelo usuário](docs/screenshots/13-usuario-abrir-chamado.png) |

| Notificações | Meu perfil |
|---|---|
| ![Notificações do usuário](docs/screenshots/18-usuario-notificacoes.jpg) | ![Perfil do usuário](docs/screenshots/19-usuario-perfil.jpg) |

## Download

O instalador para Windows está na página de releases:

**[Baixar WG Chamados v1.0.12](https://github.com/WellenSilveira/WG-Chamados/releases/tag/v1.0.12)**

> O Windows pode exibir um aviso do SmartScreen, porque o instalador ainda não tem assinatura digital. Clique em **Mais informações** e depois em **Executar assim mesmo**.

No primeiro acesso, o app pede o cadastro do administrador do sistema.

## Funcionalidades

**Perfis de acesso**

- Administrador, Resolutor e Usuário Comum, cada um com seu painel
- Novos cadastros ficam pendentes até a aprovação do administrador

**Chamados**

- Abertura com categoria, prioridade, departamento e ativo vinculado
- Atribuição e reatribuição de chamados pelo administrador, com motivo registrado
- Devolução do chamado à administração pelo resolutor, também com motivo
- Respostas no chamado e encerramento com controle de SLA
- Alerta quando um chamado fica 30 minutos sem responsável
- Status de disponibilidade do resolutor (Disponível, Em atendimento, Ausente)

**Gestão**

- Prazos de resposta e resolução por prioridade, configuráveis
- Inventário de ativos
- Relatórios
- Auditoria das ações, com período de retenção configurável
- Backup manual e automático (diário, semanal ou mensal) e restauração

**Experiência de uso**

- Notificações dentro do app, notificações nativas do sistema e aviso sonoro, configuráveis por usuário
- Tema claro/escuro e tamanho de fonte ajustável
- Janela personalizada e tela de abertura (splash)

## Tecnologias

- [Electron](https://www.electronjs.org/) com [Electron Forge](https://www.electronforge.io/)
- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- Persistência local em arquivo JSON, acessada pelo processo principal via IPC

## Como rodar o projeto

Pré-requisitos: [Node.js](https://nodejs.org/) (versão LTS) e Git.

```sh
git clone https://github.com/WellenSilveira/WG-Chamados.git
cd WG-Chamados
npm install
npm start
```

Para gerar o instalador do Windows:

```sh
npm run make
```

O instalador é criado em `out/make/squirrel.windows/x64/`.

## Estrutura do projeto

```text
src/
  main.js          processo principal do Electron (janela, banco, backup, IPC)
  preload.js       ponte segura entre o app e o processo principal
  renderer.jsx     ponto de entrada do React
  App.jsx          estado global e regras dos chamados
  screens/         telas (login, cadastro e painéis de cada perfil)
  components/      componentes reutilizáveis
  lib/             utilidades e acesso ao banco local
  assets/          imagens e ícones
docs/
  screenshots/     capturas de tela usadas neste README
```

## Decisões técnicas

- **Banco local em JSON:** o app precisa funcionar sem internet e sem servidor. O arquivo fica na pasta de dados do usuário do Windows (`%APPDATA%\WG Chamados`), fora do pacote do app, então atualizar o programa não apaga os chamados.
- **Comunicação por IPC:** o React não acessa o disco diretamente. Leitura e gravação passam por `preload.js`, que expõe só as funções necessárias ao processo principal.
- **Backup e auditoria:** o processo principal cria backups automáticos conforme a frequência escolhida, e as ações sensíveis (atribuições, mudanças de configuração, alterações de senha) ficam registradas no log de auditoria.

## Próximos passos

- Separar as regras de negócio do `App.jsx` em módulos de serviço
- Adicionar testes automatizados para as regras de SLA e atribuição

## Autoria

Desenvolvido por [WellenSilveira](https://github.com/WellenSilveira) e [Guilherme Farias](https://github.com/GuilhermeFSantos07)
