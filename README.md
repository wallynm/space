# Space 0.5

Aplicativo local de análise e limpeza de disco para macOS. Tauri 2 + React + TanStack Router/Query + Vite. Sem Next.js, SSR ou servidor Node no aplicativo instalado. As operações no sistema e os processos auxiliares são implementados em Rust.

Repositório: [wallynm/space](https://github.com/wallynm/space). Projeto na raiz do checkout; instale as dependências e execute os comandos abaixo a partir dela.

## Nova marca na versão 0.5

O Folga agora se chama **Space**. Na versão 0.5.1, usa a logo escolhida pelo usuário: um S com três formas curvas e pontas afiladas. O fundo foi adaptado para verde-claro, com o símbolo em verde escuro para manter contraste. A nova marca aparece na navegação, no monitor flutuante, na barra de menus e nos ícones do aplicativo e instalador.

A imagem enviada pelo usuário está em `brand/space-reference.png`, e a adaptação usada pelo app em `brand/space-icon.png`; os ícones nativos são gerados com `pnpm tauri icon brand/space-icon.png`. A interface usa uma cópia de 128 px, e a prévia tem favicon de 32 px. Consulte `brand/README.md` para os prompts e as fontes da marca. As logos anteriores foram conservadas em `brand/space-0.5-icon.png` e `brand/folga-legacy-icon.svg`, e as fontes da versão 0.4 em `backups/folga-0.4.0-source.tgz`.

O identificador `studio.journey.folga` e as chaves de armazenamento permanecem iguais: catálogo, histórico, preferências e seleções existentes continuam no mesmo local. Os nomes internos de workers e variáveis `FOLGA_*` também continuam compatíveis. Encerre a versão anterior antes de abrir Space; ambos usam o mesmo armazenamento. Não execute as duas versões simultaneamente.

## Interface e recursos

- **Visão geral:** limpeza de builds Rust de desenvolvimento e caches conhecidos de npm, uv/pip, Homebrew, Xcode e projetos web.
- **Explorador:** treemap interativo, navegação em subpastas, Quick Look, arquivos grandes e antigos com filtros por tipo, tamanho e data. O filtro de acesso é indicativo: leituras e configurações do filesystem podem afetá-lo.
- **Duplicados:** conteúdo completo comparado com BLAKE3, a partir de 1 MiB. Hardlinks são contados uma vez. A interface e o backend exigem pelo menos uma cópia íntegra de cada grupo antes de mover as demais.
- **Projetos:** identifica Cargo, package.json, project.godot e pyproject.toml. Separa builds/caches, dependências e demais arquivos, atribuindo arquivos ao manifesto mais próximo para não contar projetos aninhados duas vezes. Releases e dependências aparecem no diagnóstico, mas ficam fora da limpeza rápida.
- **Apps e resíduos:** identifica apps em Applications e os locais associados pelo bundle identifier. Apps do sistema não são oferecidos para remoção. Não tenta adivinhar pastas pelo nome do app nem remove Group Containers compartilhados. “Sem app encontrado” é uma hipótese para revisão, não prova de dados dispensáveis. Containers protegidos exigem leitura opcional e autorização do macOS; itens não medidos ficam bloqueados.
- **Docker:** cache Buildx, imagens, containers e volumes por recurso. Somente sockets Unix locais. Preserva containers em execução, imagens referenciadas e volumes vinculados a qualquer container. Não executa prune geral. Volumes exigem `APAGAR VOLUMES`. Camadas compartilhadas, tamanhos desconhecidos e o disco virtual impedem prometer a soma como espaço recuperável no Mac.
- **Diagnóstico:** informações do contêiner APFS, uso do volume de dados e snapshots de sistema/dados. Espaço purgável e tamanho de snapshots não informados são mostrados como desconhecidos. Snapshots não são apagados.
- **Crescimento:** histórico de espaço livre a cada 5 minutos e comparação das análises manuais completas de uma mesma pasta. Leituras incompletas não são usadas para alegar redução de espaço. Guarda até 2.016 amostras e 10.000 observações de pastas localmente.
- **Histórico e recuperação:** arquivos pessoais e itens de apps vão à Lixeira nativa (`NSFileManager`). Recuperação individual pelo Histórico, sem sobrescrever um destino existente. Se o macOS bloquear acesso à Lixeira, a recuperação manual pelo Finder continua disponível. Itens na Lixeira continuam ocupando espaço; não são somados como espaço liberado.
- **Monitor flutuante e avisos:** janela arrastável sempre sobre as demais, na barra de menus. Histórico leve enquanto o Space está aberto; notificações opcionais com limite configurável e intervalo mínimo de 6 horas. Nunca limpa automaticamente.

## Catálogo e sincronização na versão 0.4

- **Limpar mantém o índice:** remove somente os registros dos caminhos que saíram, recalcula os totais do mapa/projetos e grava o catálogo atualizado. Falhas parciais preservam os demais registros e seleções válidas. IDs que já saíram do índice são ignorados e registrados como preservados, sem repetir exclusões.
- **Identidade estável por arquivo:** caminho, dispositivo, inode, tamanho, mtime e ctime compõem a identificação. Uma alteração, mesmo com tamanho e mtime restaurados, retira a identidade anterior da seleção. A identidade é conferida outra vez imediatamente antes de enviar à Lixeira; não se exige uma varredura global só porque passou tempo. Duplicatas ainda exigem hash completo e uma cópia íntegra remanescente.
- **Monitor nativo em Rust:** `notify` usa FSEvents no macOS. Eventos de criação, escrita, remoção e ambas as pontas de renomeações entram em uma fila limitada; agrupamento de 2 segundos, com máximo de 5 segundos sob mudanças contínuas. Releituras de diretórios são superficiais; somente novas subárvores e diretórios alterados são percorridos. Uma mudança isolada em arquivo não lê os arquivos de outras pastas.
- **Reconciliação automática:** ao iniciar com um índice salvo, uma conferência dos metadados recupera mudanças feitas com o app fechado. A cada 10 minutos, uma nova conferência cobre eventos perdidos, arquivos de rede e mudanças sem notificações. Erro/overflow do monitor solicita reconciliação completa; falhas são apresentadas e tentadas novamente após 60 segundos. Essas conferências usam o inventário incremental e não calculam hashes de todo o disco.
- **Uso durante a conferência:** o catálogo salvo pode ser consultado e selecionado enquanto a reconciliação ocorre em segundo plano. Apenas a seleção escolhida é conferida para limpar. O resultado de um worker só entra se a raiz, revisão e proteção continuarem compatíveis; nunca sobrescreve uma limpeza ou análise mais recente. A interface também recusa respostas antigas.
- **Totais e hardlinks:** os metadados privados incluem arquivos pequenos, permitindo atualizar totais, projetos e a atribuição de espaço a hardlinks após uma remoção. O próprio armazenamento do índice fica fora da análise, evitando ciclos de atualização do catálogo por ele mesmo.
- **Caches rápidos persistentes:** a última lista também é salva com suas identidades privadas. Uma limpeza elimina apenas os candidatos afetados; caminhos ausentes são retirados ao carregar ou reconciliar a lista. A conferência completa de um cache escolhido continua sendo obrigatória antes da exclusão, incluindo Git e processos ativos. O monitor de arquivos acompanha a raiz selecionada no Explorador; descoberta de novos tipos de cache pela Visão geral continua usando sua análise própria.

A atualização ocorre enquanto o Space permanece aberto na barra de menus. Não há serviço instalado para monitorar o disco com o app encerrado. Nenhuma conferência ou evento executa limpeza automática. A versão 0.3 é migrada pela reconciliação ao abrir; suas identidades antigas continuam sujeitas à validação disponível na versão original até essa migração.

Referências técnicas: [notify/FSEvents e limites de eventos](https://docs.rs/notify/latest/notify/) e [TanStack QueryClient](https://tanstack.com/query/latest/docs/framework/react/reference/classes/QueryClient).

## Outros recursos da versão 0.3

- **Catálogo persistente:** reabre o último mapa e permite selecionar arquivos com validação individual antes da limpeza. Grupos de duplicatas são confirmados novamente após reiniciar o app.
- **Análise incremental:** reaproveita listagens de diretórios cuja identidade, mtime e ctime continuam iguais. As conferências completas percorrem os metadados conhecidos; atualizações por eventos se limitam aos caminhos afetados. Somente o último catálogo do Explorador é conservado.
- **Progresso contínuo:** o próprio processo Rust transmite pasta, etapa, entradas, bytes encontrados, tempo e diretórios reutilizados. Não estima porcentagem sem conhecer o total. O estado vem do backend e é compartilhado entre a janela principal e o monitor; ambos permitem interromper uma operação.
- **Pastas protegidas:** regras persistentes, conferidas no Rust na análise e antes da limpeza. A exclusão de um ancestral que contenha um local protegido também é bloqueada. Alterar regras invalida planos e seleções. A proteção do armazenamento conhecido de Docker/OrbStack bloqueia sua limpeza por recurso. Não equivale a proteger qualquer volume Docker por seu nome.
- **Permissões:** avisos por caminho, orientação sobre Acesso Total ao Disco e acesso aos ajustes do macOS. “Reanalisar pasta” consulta apenas aquele local e abre seu próprio mapa; não mistura silenciosamente uma leitura nova com dados antigos de outras pastas.
- **Atualizações:** busca manual ou opcional ao abrir, aviso de versão disponível, notas, progresso, cancelamento de download, instalação após verificação e reinício explícito. HTTPS, chave pública fixada na compilação e assinatura vinculada à versão são obrigatórios. O código de download/verificação foi testado com pacote assinado e versões/conteúdos adulterados, sem instalar uma atualização no Mac.

Dados locais em Application Support: `catalog.json`, `scan.json`, `protection.json`, `monitor.json`, `history.json` e `update-preferences.json`. O catálogo contém caminhos e metadados, não o conteúdo dos arquivos. Um arquivo de proteção inválido bloqueia a limpeza por precaução, até revisar as regras nas Preferências.

## Segurança e limites da análise

A análise não apaga nada. Toda remoção exige seleção e revisão. IDs vêm de registros mantidos no backend. Arquivos pessoais e caches rápidos são revalidados por identidade e estado, sem expirar somente pelo tempo; ferramentas de apps e Docker conservam suas regras de validade próprias. Identidade, tamanho, modificações, links simbólicos e processos ativos são conferidos novamente. A limpeza rápida de projetos exige diretórios ignorados pelo Git e sem arquivos rastreados; código, dependências e builds de release são preservados.

O antigo disco Docker.raw tem fluxo separado: somente com Docker/OrbStack fechados e confirmação `APAGAR DOCKER`, que remove todos os dados desse disco. Caches da limpeza rápida e recursos Docker são removidos permanentemente. Arquivos pessoais e apps usam a Lixeira.

As análises maiores e medições de dados de apps usam processos auxiliares do próprio executável Rust, com cancelamento e limites de tempo. Isso evita prender a interface quando o macOS aguarda uma autorização. Por padrão, o explorador preserva containers e dados protegidos em Library; escolha a pasta explicitamente para solicitar leitura. Não concede permissões de privacidade por conta própria.

O catálogo limita a leitura a 500.000 entradas e apresenta até 5.000 arquivos a partir de 50 MB; a lista visível mostra 500 resultados por filtro. O mapa desenha os 40 maiores itens e agrega os demais. Avisos e leituras parciais ficam explícitos. Espaço alocado não equivale necessariamente ao espaço exclusivo recuperável em APFS.

O frontend não tem acesso genérico a shell ou filesystem. Comandos externos necessários (Git, Docker, diskutil, Quick Look) são invocados pelo Rust com argumentos separados, sem shell.

## Por que não há SSR

A interface depende dos arquivos e processos da máquina, sem páginas públicas para indexar. Uma SPA embarcada atende ao produto; TanStack Router usa hash history e TanStack Query administra os comandos assíncronos do Rust. SSR acrescentaria um servidor e um runtime sem benefício aqui.

Referências: [Tauri + Vite](https://v2.tauri.app/start/frontend/vite/) e [TanStack Router history](https://tanstack.com/router/latest/docs/guide/history-types).

## Executar e empacotar

- `pnpm install`
- `pnpm tauri dev`: app nativo.
- `pnpm dev`: prévia visual com dados ilustrativos; alterações reais são bloqueadas.
- `pnpm build:mac`: app e instalador .dmg em `releases/`, sem automação do Finder.

O pacote deste Mac é Apple Silicon (arm64), macOS 12 ou superior. Abra o DMG e arraste Space.app para Applications. A assinatura é ad hoc para uso local; distribuição pública requer Developer ID e notarização. O empacotamento confere a assinatura e o DMG em uma pasta temporária fora de Documents sincronizado.

Fechar a janela mantém o monitor na barra de menus. Clique no ícone para mostrar/esconder a janela flutuante; o menu oferece abrir, monitor e encerrar.

## Publicar atualizações e notarizar

Esta edição local não inventa um servidor de atualização. Enquanto o canal e a chave pública não forem configurados, a interface informa que as atualizações não foram publicadas e não realiza chamadas de rede.

Para gerar uma edição com updater ativo, configure no ambiente de compilação:

- `FOLGA_UPDATE_URL`: endereço HTTPS do manifesto `latest.json`.
- `FOLGA_UPDATE_PUBLIC_KEY`: conteúdo da chave pública gerada pelo signer do Tauri.
- `FOLGA_UPDATE_DOWNLOAD_BASE`: diretório HTTPS dos pacotes.
- `TAURI_SIGNING_PRIVATE_KEY_PATH` ou `TAURI_SIGNING_PRIVATE_KEY`: chave privada guardada fora do projeto e dos artefatos; senha opcional em `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- `APPLE_SIGNING_IDENTITY` e `FOLGA_NOTARY_PROFILE`: opcionais para usar seu certificado Developer ID e perfil já cadastrado no Keychain para notarização. Esta máquina ainda não tem Developer ID disponível.

Execute `pnpm release:mac`. O script valida a configuração, compila com a chave pública, assina o app, prepara `Space_<versão>_<arquitetura>.app.tar.gz`, assina o pacote com `--app-version`, gera `releases/latest.json` e produz o DMG. Se um perfil de notarização for informado, submete app e DMG e aplica os tickets antes da entrega. A publicação dos arquivos no endereço HTTPS é uma etapa separada; nenhuma chave privada vai para o manifesto ou instalador. A fixture de teste possui apenas chave pública e assinatura; sua chave privada descartável foi removida.

Referências: [Updater Tauri](https://v2.tauri.app/plugin/updater/) e [Assinatura macOS](https://v2.tauri.app/distribute/sign/macos/).

## Verificar

- `pnpm build`, `pnpm test` e `pnpm test:release`.
- `cargo test --manifest-path src-tauri/Cargo.toml`: validações de seleção, duplicados, Git, proteção de dados, transporte dos processos Rust, cancelamento, Docker simulado e Lixeira/recuperação com fixture descartável.
- `cargo run --manifest-path src-tauri/Cargo.toml --example inspect`: leitura nativa dos candidatos de limpeza rápida.
- `cargo run --manifest-path src-tauri/Cargo.toml --example inspect_tools -- /caminho/de/teste --apps`: catálogo, APFS, disponibilidade Docker e apps, somente leitura.

Confira evidências e limitações em [VERIFICACAO.md](VERIFICACAO.md). As versões anteriores foram conservadas nos instaladores 0.1.0 e 0.2.0, com respectivos backups de fonte em `backups/`.

### Regressão da sincronização

- `pnpm test`: inclui respostas atrasadas, preservação de seleções e uma cópia íntegra em grupos de duplicatas.
- `pnpm test:native`: inclui limpeza/persistência/reabertura, alterações por caminho, renomeações, mtime restaurado, hardlinks, permissões, reconciliação de eventos perdidos e um evento real de FSEvents em uma pasta temporária.
- `pnpm build`, depois `pnpm preview` em outro terminal e `pnpm test:ui`: fluxo real de React/TanStack com o mock oficial de IPC do Tauri, usando exclusivamente dados de teste. Confere duas limpezas, reabertura, seleções após mudanças, ausência de varredura completa e layout de 840 px. Requer Chromium do Playwright instalado. Não substitui a conferência da janela nativa do macOS.
