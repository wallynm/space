# Space

Marca para o aplicativo local de análise e limpeza de disco. A versão 0.5.1 usa a logo escolhida pelo usuário: três formas curvas compondo o S, com as pontas afiladas preservadas. Fundo verde-claro e símbolo em verde escuro mantêm contraste na interface e no ícone pequeno. A palavra Space é texto da interface em IBM Plex Sans, mantendo legibilidade e acessibilidade.

- `space-reference.png`: logo original enviada pelo usuário, preservada sem alterações.
- `space-icon.png`: adaptação da referência com cores claras e cantos arredondados, criada pelo tool integrado imagegen. Fonte do ícone do aplicativo.
- `space-0.5-icon.png`: proposta anterior de Space, preservada.
- `../src-tauri/icons/`: PNGs, ICNS e ICO gerados pelo CLI do Tauri a partir da imagem original.
- `../src/assets/space-icon.png`: cópia do ícone de 128 px usada na interface.
- `../public/brand/space-favicon.png`: cópia do ícone de 32 px usada na prévia.
- `folga-legacy-icon.svg`: marca anterior preservada.

Regenerar: `pnpm tauri icon brand/space-icon.png`, seguido de copiar `src-tauri/icons/128x128.png` para `src/assets/space-icon.png` e `src-tauri/icons/32x32.png` para `public/brand/space-favicon.png`.

## Prompt da adaptação atual

Use case: logo-brand. Edit target: the provided square green logo image. This is the user's chosen logo for Space.
Preserve the exact distinctive S silhouette from the input: the same three flowing lobes, the same sharp upper-left and lower-right tapered tips, the same counterspaces, the same orientation and proportions. Do not redesign, rotate or replace it with a font letter.
Change only colors and app-icon framing: recolor the white S to a flat dark forest green #153e35. Recolor the saturated green background to a flat light mint green #bfe6a9, removing the gradient and texture. Retain the centered S at the same relative scale.
Make the mint background a rounded-square macOS app-icon tile, inset by 4 percent from the canvas edges, with corner radius approximately 22 percent of the tile width. The pixels outside this rounded tile must be genuinely transparent. Keep the entire S comfortably inside the tile.
A clean two-color graphic with crisp smooth edges and antialiasing at boundaries only. No shading, no noise, no gradient, no shadow, no text, no extra symbols. Single final square icon.

Modo: edição pelo tool integrado imagegen, usando a imagem enviada pelo usuário como alvo. O resultado é raster com variações suaves de cor, não um vetor editável.

## Prompt de criação anterior (versão 0.5)

Use case: logo-brand.
Asset type: finished macOS app icon for Space, a local disk analysis and cleanup application.
Primary request: design a distinctive minimal geometric S monogram, formed by two broad curved bands with a clean diagonal negative-space opening between them, suggesting orderly disk space and room to breathe.
Style: flat precise vector-like graphic, balanced Swiss graphic design, smooth geometric curves, crisp edges, bold simple silhouette readable at 16px.
Composition: one centered icon only, square canvas 1024x1024. A dark forest-green rounded square tile fills approximately 90 percent of the canvas; generous 24 percent interior padding. Mint-green symbol inside, centered optically.
Color palette: tile #153e35, symbol #bfe6a9, no other colors.
Background: genuine transparent alpha outside the rounded square tile. Opaque flat tile inside. No shadows.
Constraints: no text, no wordmark, no slogan, no stars, no rocket, no planet, no sparkle, no outline frame, no gradient, no texture, no 3D, no mockup. The S should feel sculpted from two solid rounded bands separated by visible negative space; never resemble a dollar sign. Output the single final app icon, not a presentation sheet.

## Prompt do refinamento anterior (versão 0.5)

Edit the provided Space app icon. Keep exactly the S geometry, proportions, placement, rounded-square outline and transparent outer background. Change only the surface treatment: remove every gradient, texture, highlight, noise, shadow and sheen. Make the tile one perfectly uniform solid forest green #153e35. Make the S one perfectly uniform solid mint green #bfe6a9. Crisp flat vector-like edges with antialiasing only at boundaries. No text, no extra elements.

Modo: tool integrado imagegen, geração inicial seguida de edição. A imagem final conserva variações suaves de cor; o resultado é raster, não um vetor editável. Os prompts registram o pedido enviado ao gerador.
