# Verificação do Space 0.5.1

01/10/2026, macOS arm64. Migração para o repositório wallynm/space e aplicação da logo escolhida pelo usuário.

- Repositório clonado em `/Users/wallyssonnunes/www/space`, a partir do commit inicial `7a82c32ff2f2ce9454bf08ab61640240bd725553`, branch main. A licença MIT existente foi preservada.
- 138 arquivos importados conferidos por SHA-256 antes de adaptar a marca. Fontes, lockfiles, documentação, capturas, backups e instaladores anteriores transferidos; dependências reinstaladas com `pnpm install --frozen-lockfile`. Arquivos gerados, dependências, instaladores e backups ficam fora do Git.
- A pasta anterior foi conservada em `folga-before-migration-2026-10-01`, ao lado do workspace original. O caminho anterior `folga` agora é um link simbólico para o checkout novo. Assim, os caminhos antigos chegam ao projeto atual e a cópia anterior permanece preservada.
- Logo original enviada pelo usuário em `brand/space-reference.png`. Adaptação de cor pelo tool integrado imagegen em `brand/space-icon.png`, preservando as curvas e pontas do S, com fundo verde-claro e símbolo em verde escuro. Prompts em `brand/README.md`; proposta anterior em `brand/space-0.5-icon.png`.
- PNG, ICNS e ICO regenerados pelo CLI do Tauri. Logo aplicada na navegação, monitor flutuante, favicon e ícones nativos. O ICNS extraído do DMG foi comparado byte a byte com a fonte gerada.
- Identificador `studio.journey.folga`, labels de janela e chaves de armazenamento preservados. Código de catálogo, indexação, limpeza e ponte de sistema idêntico ao original. Nenhum dado do usuário foi modificado. Evidência em `releases/Space_0.5.1-migration-verification.json`.
- TypeScript/Vite e Rust release compilados na nova pasta. **15 testes aprovados:** 13 de frontend e 2 de release. A suíte completa Rust não foi repetida nesta mudança visual/de localização; o código nativo não mudou.
- Fluxo do catálogo no build de produção com mock oficial de IPC: seleção persistida, limpeza parcial, segunda seleção somente dos arquivos restantes, reabertura sem restaurar registros removidos, mudança de identidade e seleção não relacionada. Nenhuma varredura completa, nenhum erro de console e sem overflow em 840 px. Captura `screenshots/space-0.5.1-indice.jpg` identificada como IPC simulado.
- Monitor flutuante em prévia: logo carregada, sem erros de console e sem overflow em 340 × 290. Captura `screenshots/space-0.5.1-monitor.png` identificada como dados ilustrativos.
- DMG validado com `hdiutil verify`; app montado somente para leitura passou em `codesign --verify --deep --strict`. Info.plist confirmou Space 0.5.1 e o identificador preservado. Workers Rust de listagem e catálogo executados no binário do DMG com fixture descartável, sem avisos. Montagem e fixture removidas após a conferência.
- Instalador `releases/Space_0.5.1_aarch64.dmg`, 7,375,798 bytes. SHA-256: `8373990abf3f4b42520e18570e52544686745f1e30775f95a41581839a5ad4d7`. Checksum e evidências JSON preservados em releases.
- Cache próprio de compilação em `/private/tmp/space-051-target` removido após validar o instalador: 1,364,316,160 bytes contabilizados por du.

A interface foi conferida no navegador; a interação com janelas nativas não foi validada nesta entrega. Assinatura ad hoc para uso local, sem notarização Apple. Mudanças locais no checkout, sem commit/push, publicação externa ou instalação em Applications.

## Verificação anterior: Space 0.5.0

01/10/2026, macOS arm64. Nova marca e nome do aplicativo anteriormente chamado Folga.

- Logo gerada com o tool integrado imagegen, com transparência externa. Original raster de 1254 × 1254 em `brand/space-icon.png`; prompts em `brand/README.md`. Ícones PNG, ICNS e ICO gerados pelo CLI do Tauri; fonte anterior preservada.
- Space aplicado na interface principal, monitor flutuante, títulos de janela, menu da barra de menus, notificações, preferências e instalador. O empacotador usa o nome e a versão de `tauri.conf.json`.
- Identificador `studio.journey.folga`, labels de janela, chaves de armazenamento e flags dos workers conferidos contra o backup 0.4 e preservados. Nenhum catálogo, histórico ou preferência do usuário foi modificado. Evidência em `releases/Space_0.5.0-identity-verification.json`.
- TypeScript/Vite e Rust release compilados. **15 testes aprovados nesta entrega:** 13 de frontend e 2 de configuração do release, incluindo manifesto de pacote Space. A suíte completa Rust não foi repetida para a mudança de marca; o relatório anterior permanece abaixo.
- Fluxo do catálogo com build de produção e mock oficial de IPC: limpeza parcial, segunda seleção somente dos arquivos restantes, reabertura sem restaurar registros removidos, invalidação de identidade alterada e preservação de seleção após mudança não relacionada. Sem varredura completa, sem erros de console e sem overflow em 840 px. Captura `screenshots/space-0.5-indice.jpg` anotada como IPC simulado.
- Monitor flutuante em prévia visual: palavra Space, imagem carregada de 128 px exibida em 22 px, sem overflow em 340 × 290 e sem erros de console. Captura `screenshots/space-0.5-monitor.png` identificada como dados ilustrativos.
- **DMG final validado:** checksum de `hdiutil verify`; app extraído em montagem somente leitura passou em `codesign --verify --deep --strict`. Info.plist confirmou Space, 0.5.0 e o identificador preservado. ICNS no instalador idêntico ao ícone gerado.
- Executável do DMG executou workers Rust de listagem e catálogo em fixture temporária sem links simbólicos, sem avisos e sem iniciar a janela Tauri. Fixture e montagem removidas após a verificação. Nenhuma limpeza de arquivo pessoal foi executada.
- Instalador `releases/Space_0.5.0_aarch64.dmg`, 7,070,186 bytes. SHA-256: `1654a27089607d95194d6047789b08a248d12305bbf4b0b408c372365788c484`. Checksum e evidências JSON em `releases/`.
- Backup das fontes 0.4 em `backups/folga-0.4.0-source.tgz`; fontes e instaladores anteriores conservados. Cache próprio de compilação `/private/tmp/space-05-target` removido após validar o DMG: 1,363,689,472 bytes contabilizados por du.

A interface foi conferida no navegador; não foi validada a interação com janelas nativas nesta entrega. A assinatura continua ad hoc para uso local, sem notarização Apple. Nenhuma publicação externa, atualização automática ou instalação em Applications foi realizada. Encerre a versão anterior antes de abrir Space, pois compartilham os mesmos dados.

## Verificação anterior: Folga 0.4.0

30/09/2026, macOS arm64. Instalador para Mac Apple Silicon, macOS 12 ou superior.

- **69 testes aprovados:** 54 Rust, 13 de estado/interface e 2 do pipeline de release. TypeScript/Vite e Rust release compilados após a correção final da ordem de publicação do catálogo.
- Regressão reproduzida antes da correção com `cargo test --manifest-path src-tauri/Cargo.toml cleanup_keeps_remaining_catalog_and_persists_removal -- --nocapture`: falhou com “o arquivo enviado à Lixeira continua no índice”. Após a correção passou, incluindo serialização/reabertura e preservação dos registros restantes.
- Limpeza nativa em fixtures descartáveis: arquivos removidos retirados dos registros, totais atualizados, segunda seleção ignorando ID já removido e preservando os demais. Todos os itens de teste enviados à Lixeira foram restaurados; nenhum arquivo pessoal foi apagado.
- FSEvents real recebeu evento de escrita numa pasta temporária; a reconciliação atualizou apenas o caminho afetado. Também foram testados agrupamento/limite da fila, as duas pontas de renomeações e rejeição de eventos de leitura e caminhos fora da raiz/proteção.
- Conteúdo alterado com mesmo tamanho e mtime restaurado: ctime detectou a alteração, invalidando a identificação antiga. Identidade inclui caminho, dispositivo, inode, tamanho, mtime e ctime. A validação continua acontecendo antes da exclusão, independentemente de idade do catálogo.
- Metadados privados abrangem arquivos pequenos, permitindo recalcular alocação, projetos e hardlinks após remoções. Hardlinks restantes recebem a atribuição de bytes e a identificação atualizada.
- Alteração isolada não lê pasta vizinha sem permissão. A perda de permissão preserva os dados conhecidos e bloqueia seu uso; a reanálise do escopo restaura sua disponibilidade. Links simbólicos e travessia fora da raiz continuam rejeitados.
- Inicialização e auditoria periódica usam uma conferência completa dos metadados a cada 10 minutos, reutilizando inventários de diretórios. Eventos normais atualizam somente caminhos afetados. Erro/overflow solicita auditoria; falhas são repetidas após 60 segundos. O monitor existe apenas enquanto o app está aberto, sem serviço instalado e sem limpeza automática.
- Concorrência: resultado de worker antigo não substitui catálogo limpo nem operação mais recente; verificam-se raiz, revisão, ocupação do backend e política de proteção. O estado é substituído antes de anunciar a alteração às janelas. O frontend também recusa respostas atrasadas.
- Caches rápidos salvam identificação privada em `scan.json`; exclusão mantém os candidatos restantes. Candidatos ausentes são retirados ao carregar/reconciliar. A leitura/Git/processos de um cache escolhido continuam sendo conferidos antes da exclusão. Descoberta e análise de novos caches pela Visão geral conserva seu fluxo próprio; o monitor de arquivos acompanha a raiz do Explorador.
- **Fluxo visual com o build de produção e o mock oficial de IPC do Tauri:** catálogo salvo selecionável; limpeza parcial preserva seleção válida; duas limpezas enviaram IDs `a,b` e depois somente `b`; reabertura não trouxe registros removidos; nova identidade remove seleção antiga; alteração não relacionada mantém a seleção. Nenhum `scan_catalog` foi necessário nesse fluxo. Layout de 840 px sem overflow e nenhum erro de console. São respostas simuladas, sem alterações reais pelo navegador. Captura `screenshots/folga-0.4-indice.jpg` identificada como teste de IPC.
- **DMG final:** `hdiutil verify` aprovado; app extraído do DMG passou em `codesign --verify --deep --strict`; Info.plist confirmou 0.4.0.
- Binário empacotado executou o worker de reconciliação Rust sem Tauri/WebKit: alteração isolada visitou 1 arquivo e relistou 0 diretórios; detectou mudança de mesmo tamanho/mtime, exclusão persistida, nova subárvore, renomeação e alteração perdida recuperada por auditoria. ID do catálogo preservado e revisão avançou até 6. Pasta vizinha sem permissão não foi lida.
- Leitura real das fontes, somente leitura, pelo binário do instalador: 19 entradas, 0 avisos.
- Instalador `releases/Folga_0.4.0_aarch64.dmg`, 5,463,746 bytes. SHA-256: `77b0aecd2945640689127dc573ac3f5ad6662ea37e66a24a5dc6466335a824b9`. Checksum e evidências JSON salvos em `releases/`.
- Fontes, instaladores anteriores e backup 0.3 preservados. Cache próprio de compilação em `/private/tmp/folga-04-target` removido após validar o instalador: 5,475,614,720 bytes contabilizados por `du` (5.10 GiB). Isso não representa necessariamente o mesmo aumento imediato de espaço físico no APFS.

A interação entre janelas nativas, a entrega de notificações e concessões reais de privacidade pelo macOS não foram verificadas nesta correção. A interface foi testada com IPC simulado e os processos/FSEvents nativos separadamente. Docker permanece coberto pelos testes de fixtures; não houve uso de daemon real nesta entrega.

A assinatura é ad hoc para uso local, sem notarização Apple. O updater continua implementado e inativo até configurar canal HTTPS e chave pública de produção. Não houve publicação externa nem atualização automática do app instalado.

## Verificação anterior: Folga 0.3.0

30/09/2026, macOS arm64. Instalador para Mac Apple Silicon, macOS 12 ou superior.

- TypeScript/Vite e compilação Rust release concluídos após todas as correções.
- **49 testes aprovados:** 38 Rust, 9 de interface/estado e 2 de configuração do release.
- Análise incremental: listagens de diretórios sem mudanças reutilizadas; arquivos alterados, novos e removidos detectados; nomes que tentam escapar da raiz no índice descartados. Os metadados dos arquivos continuam sendo conferidos em todas as análises.
- Persistência: catálogo completo passa pelo transporte/serialização privada; após reabrir, o mapa fica disponível para consulta e não autoriza limpeza ou comparação de duplicatas antes de atualizar.
- Proteção: scopes normalizados, links simbólicos recusados, limites de caminho respeitados; dados protegidos ficam fora do catálogo e a remoção de um ancestral que os contenha é bloqueada. Regras são conferidas novamente antes de limpar; alterações invalidam os planos de todas as ferramentas.
- Permissões: erro real de leitura gerado em fixture temporária com permissões restritas, reportado por caminho e reanalisado após restaurar suas permissões. Não equivale a ter validado concessões TCC reais pelo macOS.
- Sincronização: estado e progresso mantidos no Rust, eventos para ambas as janelas e leitura periódica como recuperação. Regressão da liberação da trava testada para impedir que a conclusão de uma operação libere outra recém-iniciada. Respostas atrasadas do frontend não substituem revisões mais recentes.
- Updater: teste de integração com o plugin real e servidor local de teste. Aceitou um payload assinado pelo signer oficial do Tauri e rejeitou conteúdo adulterado, assinatura inválida e uma versão diferente da vinculada à assinatura. Somente download/verificação; o payload descartável não foi instalado.
- Produção do updater exige HTTPS, TLS validado, chave pública fixada na compilação e assinatura vinculada à versão. A fixture usa HTTP apenas em loopback e contexto de teste; o app de produção não permite essa configuração.
- Pipeline de release gera pacote `.app.tar.gz`, assinatura e manifesto quando configurado; tem suporte a certificado Apple e perfil de notarização do Keychain. Publicação remota e notarização não foram executadas por falta de canal configurado, chave de produção e Developer ID nesta máquina.
- Docker continua sem CLI neste Mac; integração permanece verificada com fixtures. Nenhum daemon real foi utilizado.
- Conferência da interface no navegador: aviso de catálogo salvo; todas as seleções de arquivos bloqueadas após reabrir; seleções liberadas após atualizar; orientação por pasta; controles de proteção e atualizações. Prévia bloqueia operações no Mac.
- Layout conferido em 1280 px e 840 px, sem overflow horizontal nas novas preferências. Captura: `screenshots/folga-0.3-preferencias.jpg`, com dados ilustrativos. Nenhum erro de console observado na conferência final.
- DMG final: `hdiutil verify` aprovado; assinatura do app dentro do DMG aprovada com `codesign --verify --deep --strict`; versão 0.3.0 conferida.
- Binário do instalador executou análises e medições Rust sem inicializar Tauri/WebKit. A segunda análise da fixture reutilizou dois diretórios; um novo arquivo foi detectado na atualização seguinte; progresso recebido durante a execução. Leitura real das fontes: 17 entradas e 0 avisos.
- Instalador: `releases/Folga_0.3.0_aarch64.dmg`, 5,349,365 bytes. SHA-256: `9e36d1ab6bbd09b0724af08bb736673886cfdfc83c30fd50e3bcefdd5ec2280e`. Checksum e resumo JSON também salvos em `releases/`.
- Instaladores 0.1.0 e 0.2.0 e backups das fontes preservados. Cache Rust desta entrega em `/private/tmp/folga-03-target` removido após validar o DMG: 4,784,455,680 bytes contabilizados por `du` (aproximadamente 4.46 GiB). Não foi alegada a mesma liberação física imediata em APFS.

A tentativa de conferir a janela nativa ficou bloqueada pelas permissões pendentes de Acessibilidade e Captura de Tela do Computer Use. Interação nativa entre janelas, entrega de notificações pelo macOS e concessão real de Acesso Total ao Disco permanecem sem verificação visual. A prévia visual e os processos nativos foram verificados separadamente; não houve exclusão de arquivos pessoais, desinstalação de apps do usuário nem esvaziamento de sua Lixeira.

A edição entregue tem assinatura ad hoc para uso local. O mecanismo de atualização está implementado, mas fica inativo e não faz chamadas de rede até compilar uma edição com canal HTTPS e chave pública configurados. Certificado Apple/notarização e publicação no canal são etapas externas ainda pendentes.

## Verificação anterior: Folga 0.2.0

30/09/2026, macOS arm64. Instalador para Mac Apple Silicon, macOS 12 ou superior.

- TypeScript, Vite e build Rust de produção concluídos após as últimas alterações.
- 28 testes Rust e 6 testes de interface aprovados: 34 no total.
- Cobertura inclui preservação de arquivos versionados, rejeição de links simbólicos e planos alterados, confirmação por hash completo de duplicatas, preservação de uma cópia, associação exata de dados de aplicativos e seleção individual de recursos Docker.
- Teste real de ida à Lixeira e restauração nativa aprovado usando exclusivamente uma pasta temporária. Restauração rejeita destino já existente e arquivos alterados.
- Processos auxiliares Rust conferidos quanto a transporte de identificadores e cancelamento. A análise e a medição também foram executadas com sucesso pelo binário extraído do instalador final, antes da inicialização de Tauri/WebKit.
- Análise real, somente leitura: catálogo com 14 entradas; descoberta de 27 aplicativos, 57 possíveis grupos de resíduos e 134 partes associadas, sem avisos. Grupos encontrados são candidatos para revisão, não uma indicação de que seus dados devem ser apagados.
- Diagnóstico APFS real: leitura do container, do volume de dados e de snapshots aprovada. Espaço purgável indisponível permanece sem estimativa; snapshots não são removidos.
- Docker não está instalado neste Mac. Integração validada com fixtures do formato JSON da CLI, incluindo recursos em uso, contexto remoto, mudança de estado e comandos individuais. Execução contra um daemon Docker real permanece sem verificação.
- Interface conferida no navegador em 1280 px e na largura mínima de 840 px, sem overflow horizontal. Fluxos verificados: mapa e navegação por pasta; filtros de arquivos grandes/antigos; seleção e revisão de duplicatas; projetos; partes de aplicativos; categorias Docker e confirmação de volumes; APFS; evolução de pastas; monitor e preferências.
- A prévia do navegador usa dados ilustrativos e bloqueia limpeza. A imagem desta versão está em `screenshots/folga-0.2-mapa.jpg`.
- DMG final validado por `hdiutil verify`; app contido no DMG validado com `codesign --verify --deep --strict`; versão 0.2.0 e executável arm64 conferidos.
- SHA-256: `6d759fef063ddce4f3459d342bb38154d5e0243cff0ec40737732f63fe8e97f5`.
- Instalador: `releases/Folga_0.2.0_aarch64.dmg`, 3.995.025 bytes. Checksum também salvo no arquivo `.dmg.sha256`.
- Instalador 0.1.0 e backup das fontes originais preservados.
- Cache gerado nesta compilação, `src-tauri/target`, removido após validar o instalador: 4.005.675.008 bytes contabilizados por `du` (aproximadamente 3,73 GiB). A remoção de arquivos não equivale necessariamente à mesma liberação física imediata em APFS. Uma nova compilação Rust recriará esse cache.

A automação da janela nativa e a entrega de notificações pelo macOS não foram verificadas: as permissões de Acessibilidade e Captura de Tela continuaram pendentes. A lógica nativa foi exercitada diretamente e pelo app empacotado; a conferência visual utilizou a prévia do navegador. Nenhum aplicativo do usuário foi desinstalado e a Lixeira do usuário não foi esvaziada durante a verificação.

A assinatura é local (ad hoc). O instalador não foi notarizado para distribuição pública.

## Verificação anterior: Folga 0.1.0

30/09/2026, macOS arm64.

- TypeScript e Vite: build de produção concluído.
- Rust: build release concluído.
- Vitest: 4 testes aprovados.
- Rust: 10 testes aprovados, com exclusões limitadas a fixtures temporárias.
- Análise real em Rust, somente leitura: 110.946 diretórios, 18 candidatos, 1 bloqueado, 0 avisos de leitura; 7.599.153.152 bytes de caches elegíveis na medição.
- Interface conferida no navegador: análise ilustrativa, seleção de caches excluindo Docker, revisão, confirmação adicional Docker, histórico, preferências, ausência de erros de console.
- Monitor conferido em 340 x 290, sem overflow.
- DMG: checksum válido por hdiutil; assinatura ad hoc do app dentro do DMG validada com codesign --verify --deep --strict.
- SHA-256 do DMG: 0525126efb9aef3b379e5afa43c23bd73361a7f14101a9d5b0acc85c44feb737.

A verificação visual automática da janela nativa não foi concluída: as permissões de Acessibilidade e Captura de Tela continuaram pendentes. A leitura do disco foi verificada executando o mesmo engine Rust diretamente; a prévia do navegador sempre usa dados ilustrativos e não permite exclusões.

O instalador está em releases/Folga_0.1.0_aarch64.dmg. A assinatura é local (ad hoc); esta versão não foi notarizada para distribuição pública.
