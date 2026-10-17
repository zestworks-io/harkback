<p align="center">
  <img src="assets/logo.png" alt="Harkback" width="96">
</p>

<h1 align="center">Harkback</h1>

<h3 align="center">
Explica los términos mientras lees. Recuerda lo que entendiste.<br>Recupéralo cuando vuelvas a encontrar el término.
</h3>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <a href="CHANGELOG.md"><img alt="Version" src="https://img.shields.io/github/package-json/v/zestworks-io/harkback?filename=apps%2Fextension%2Fpackage.json&label=version&color=informational"></a>
  <img alt="Chrome MV3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white">
  <img alt="Node 22+" src="https://img.shields.io/badge/node-%E2%89%A522-339933?logo=nodedotjs&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="Local first" src="https://img.shields.io/badge/data-local--first-success">
  <a href="https://github.com/zestworks-io/harkback/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/zestworks-io/harkback?style=flat"></a>
  <a href="https://github.com/zestworks-io/harkback/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/zestworks-io/harkback"></a>
  <a href="CONTRIBUTING.md"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
</p>

<p align="center">
| <a href="#inicio-rápido"><b>Inicio rápido</b></a> | <a href="#funciones"><b>Funciones</b></a> | <a href="guide/README.md"><b>Documentación</b></a> | <a href="#privacidad"><b>Privacidad</b></a> | <a href="CHANGELOG.md"><b>Registro de cambios</b></a> | <a href="CONTRIBUTING.md"><b>Contribuir</b></a> |
</p>

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <b>Español</b> · <a href="README.fr.md">Français</a> · <a href="README.de.md">Deutsch</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.ar.md">العربية</a></p>

Harkback es una extensión de Chrome para quienes leen artículos científicos y documentos técnicos. Selecciona un término y lo explica en contexto. Cada explicación se guarda en un registro local de solo anexado. Cuando el mismo término aparece en una página posterior, incluso con otra grafía, Harkback lo subraya y muestra lo que entendiste la última vez.

> “harken back”: volver a un punto anterior.

<p align="center">
  <a href="assets/demo.mp4"><img src="assets/demo.gif" alt="Demo" width="720"></a>
  <br><sub>Selecciona un término en un PDF, haz una pregunta de seguimiento y toda la conversación se conserva. Haz clic en la animación para ver el vídeo en calidad completa.</sub>
</p>

## Inicio rápido

```sh
git clone https://github.com/zestworks-io/harkback.git && cd harkback
pnpm install && pnpm --filter @harkback/extension build
```

Abre `chrome://extensions`, activa el **modo de desarrollador**, elige **Cargar descomprimida** y selecciona `apps/extension/.output/chrome-mv3`. Después elige un modelo:

<details open>
<summary><b>Modelo local (gratis)</b></summary>

Instala [Ollama](https://ollama.com), descarga un modelo y, en la página de bienvenida, elige **Ollama**. Usa _Probar conexión_ para obtener el comando que autoriza la extensión. Nada sale de tu equipo.

</details>

<details>
<summary><b>Modelo alojado (con tu propia clave de API)</b></summary>

Elige OpenAI, Anthropic, Google Gemini, xAI Grok, DeepSeek, Qwen, Moonshot (Kimi), Zhipu GLM, Mistral, OpenRouter o una dirección personalizada compatible con OpenAI y pega tu clave. El proveedor te factura directamente; Harkback no tiene ningún servidor de por medio.

</details>

Luego selecciona un término en cualquier página y pulsa `Alt+Shift+E`. Consulta [Instalación](#instalación) y [Conectar un modelo](#conectar-un-modelo) para más detalles. Los primeros pasos están en la [guía de inicio](guide/es/getting-started.md).

<details>
<summary><b>Contenido</b></summary>

- [¿Por qué no preguntarle simplemente a ChatGPT?](#por-qué-no-preguntarle-simplemente-a-chatgpt)
- [Funciones](#funciones)
- [Tu grafo de conocimiento](#tu-grafo-de-conocimiento)
- [Cómo funciona](#cómo-funciona)
- [Instalación](#instalación)
- [Conectar un modelo](#conectar-un-modelo)
- [Usar Harkback](#usar-harkback)
- [Documentación](#documentación)
- [Privacidad](#privacidad)
- [Tus datos](#tus-datos)
- [Limitaciones](#limitaciones)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Desarrollo](#desarrollo)
- [Contribuir](#contribuir)
- [Licencia](#licencia)

</details>

## ¿Por qué no preguntarle simplemente a ChatGPT?

Puedes pegar un término en un chatbot y obtener una buena respuesta. Harkback no intenta dar una respuesta mejor. Añade lo que le falta a una ventana de chat: **memoria**. Cada término que consultas se convierte en un registro ligado a la página, la cita y la fecha, y los registros se conectan en un grafo de conocimiento que es tuyo.

|                    | Preguntar a un chatbot                                    | Harkback                                                                                                  |
| ------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Contexto**       | Copias el término y algo de texto, y cambias de pestaña   | Seleccionas el término en la página; su párrafo y su sección van con él, y la cita se verifica            |
| **La próxima vez** | Un chat nuevo empieza vacío, o olvidas que ya preguntaste | El término aparece subrayado en páginas posteriores, con lo que entendiste la última vez                  |
| **Estructura**     | Un montón de transcripciones                              | Conceptos con alias, requisitos previos, variantes y términos relacionados                                |
| **Retención**      | Ninguna                                                   | Una cola de repaso programada por un modelo de memoria: cada término vuelve justo antes de que lo olvides |
| **Tus registros**  | Viven en la cuenta del proveedor                          | Se quedan en tu navegador; exporta Markdown, notas de Obsidian o JSONL                                    |
| **Modelo y coste** | Un servicio, un plan                                      | Cualquiera de los modelos compatibles: Ollama local no cuesta nada, o usa tu propia clave de API          |

Harkback es gratuito y de código abierto (Apache-2.0), no tiene servidor ni suscripción. Sí necesita un modelo que escriba las explicaciones: uno local es gratis y uno alojado lo factura su proveedor a tu propia clave.

## Funciones

- **Explicar en contexto.** Selecciona un término, haz clic en _Explicar_ o pulsa `Alt+Shift+E`. La respuesta llega en streaming desde el modelo que configuraste y se marca como _definido en la fuente_ (la página define el término y la cita se verifica con el texto de la página) o _conocimiento externo_.
- **Recordar.** Cada explicación, pregunta de seguimiento y marca de «entendido / sigo sin entenderlo» se guarda como un evento en IndexedDB. Nada sale de tu navegador salvo la solicitud al modelo que tú lanzas.
- **Conversaciones de seguimiento.** Pregunta más en la tarjeta; cada pregunta queda encima de su respuesta y la conversación se guarda con la explicación. El Historial la muestra completa y la búsqueda la encuentra. Las fórmulas se componen tipográficamente.
- **Reencuentros.** En páginas posteriores, los términos que ya consultaste aparecen subrayados. Pasa el cursor para ver cuándo y dónde te encontraste con el término y qué entendiste, además de una línea que indica qué texto de la página coincidió; después puedes marcarlo como recordado, explicarlo de nuevo, comparar los dos usos o silenciarlo.
- **Un concepto, muchas grafías.** `LLM`, `LLMs`, `the LLM`, `large language model` y `Large-Language Models` son el mismo concepto. También lo son `β-VAE` y `beta-VAE`, y `fine-tuning` y `ﬁne-tuning` con ligadura. Las coincidencias aproximadas se te plantean como «¿es este el término que consultaste hace 3 días?».
- **Términos relacionados.** Si un modelo dice que `QLoRA` es una variante de `LoRA`, una página que solo menciona `QLoRA` te recuerda lo que entendiste sobre `LoRA`.
- **Páginas de concepto.** Abre cualquier término en el Historial para ver cuánto lo entendiste, los nombres que el modelo sugiere en tu idioma (que aceptas o rechazas), en qué se basa (requisitos previos), sus variantes y términos relacionados, y todas las veces que te lo encontraste. Las relaciones de las que el modelo no estaba seguro esperan en _Posibles relaciones_ hasta que las confirmes o las elimines. Puedes añadir un alias, fusionar dos conceptos que son el mismo, dividir uno que juntó dos términos distintos (lo que también deshace una fusión), eliminar una relación errónea o silenciar un término.
- **Repaso.** El Historial muestra un botón _Repasar_ con el número de términos pendientes. Cada término se programa con [FSRS-7](https://github.com/open-spaced-repetition/fsrs4anki), un modelo de memoria: califica una respuesta como _Otra vez_, _Difícil_, _Bien_ o _Fácil_ y el término vuelve justo antes de que lo olvides, de modo que los fáciles se espacian rápido y los difíciles regresan pronto. Cada botón muestra cuándo volverá el término. Puedes escribir lo que recuerdas antes de revelar la explicación, y un botón opcional, **Comprobar mi respuesta**, le pregunta a tu modelo cuánto te acercaste (solo sugiere una nota; tú eliges, y puedes desactivarlo en los ajustes). Todo el repaso funciona con el teclado: `Space` muestra la explicación, `1`–`4` califica, `S` salta. Cuando ambos están pendientes, los términos que se basan en otros van después de sus requisitos previos, y un término que te cuesta señala los requisitos previos que quizá falten. Recordar un término en un aviso de reencuentro cuenta como un repaso ligero. Un ajuste elige con qué probabilidad quieres recordar un término cuando le toca (90 % por defecto). El icono de la barra de herramientas muestra cuántos hay pendientes; haz clic derecho en él para abrir _Repaso_ o _Historial_.
- **Resumen semanal.** Historial → _Resumen_ muestra lo que encontraste en una semana: términos nuevos y revisitados, respuestas, los términos que aún te confunden, dónde leíste y nuevas conexiones entre conceptos. Se genera en tu equipo a partir de tus registros y no llama a ningún modelo.
- **Se apoya en lo que sabes.** Cuando un término que consultas se parece a uno que ya entiendes, se le dice al modelo y puede explicar la diferencia en vez de empezar de cero.
- **Privado por diseño.** El escaneo automático se limita a arxiv.org hasta que añadas sitios; un botón en los ajustes añade los sitios de investigación habituales. Los sitios sensibles pueden forzarse a un modelo local, y las ventanas privadas nunca registran ni escanean.
- **Registros portables.** Exporta todo como Markdown, como tarjetas de Anki, como una carpeta de notas enlazadas (un archivo por concepto con `[[enlaces]]`, listo para Obsidian; lo que escribas debajo de la línea de marca sobrevive a la siguiente exportación) o como un registro de eventos JSONL versionado con un esquema JSON publicado. Una copia de seguridad semanal en JSONL se escribe en `Downloads/harkback`, y **Importar JSONL** en el Historial la restaura (los registros que ya tienes se omiten). Un ajuste permite dejar las fuentes sensibles fuera de copias y exportaciones.
- **Aportar al bien común de datos.** Historial → _Aportar_ crea un archivo anónimo a partir de tus consultas en artículos de arXiv y DOI con licencia abierta: el identificador del artículo, la licencia, el término, el área, la sección, cuánto lo entendiste y el mes, además de las relaciones que confirmaste. Sin citas, explicaciones, direcciones ni horas exactas, y nunca una fuente sensible. Ves el archivo completo antes de guardarlo, y no se sube nada.
- **Detener, reintentar, cambiar de modelo.** Un botón _Detener_ interrumpe una respuesta mientras se escribe. Tras un fallo, la tarjeta ofrece _Reintentar_ y, si hay varios modelos configurados, _Probar con…_ para cada uno de los demás.
- **Vista previa de una página antes de leerla.** Haz clic en el botón de la barra de herramientas, pulsa `Alt+Shift+P` o usa el menú contextual, y Harkback se ofrece a escanear la página, indicando el modelo y si es remoto; no se envía nada hasta que aceptes. Una llamada al modelo elige los términos clave de la página, y tus propios registros los clasifican en _aún confusos_, _algo oxidados_, _nuevos para ti_ y _conocidos_. _Vista previa_ muestra tu explicación anterior para un término que conoces, o una breve escrita por el modelo para uno nuevo, y no registra nada. El modelo solo ve el texto de la página, nunca tu lista de conceptos, y una página sensible solo usa un modelo local. Un escaneo lee los primeros 16 000 caracteres de una página y te avisa cuando una página más larga se cortó.
- **Subtítulos de YouTube.** Añade YouTube en los ajustes y, con los subtítulos activados, los términos que ya consultaste aparecen subrayados en la línea de subtítulos. Pausa y selecciona un término para explicarlo a partir de los subtítulos que has visto. Los subtítulos automáticos, escritos por reconocimiento de voz, se comparan con más margen: `lora` por LoRA, `r l h f` por RLHF, un nombre con una o dos letras de diferencia o uno que se oyó como una palabra que suena igual. La consulta se registra con su posición de reproducción (`12:34`), y el Historial, el Repaso y las exportaciones enlazan a ese momento. Desactivado hasta que añadas el sitio; no se descarga nada, solo se lee la línea de subtítulos en pantalla.
- **GitHub, Notion y Google Docs.** Añade el sitio en los ajustes y sus páginas se leen según su propio diseño: el README de un repositorio, la conversación de un issue o pull request, una página de Notion, la vista publicada o móvil de un documento de Google. Un documento es una sola fuente sin importar cómo llegaste a él, y solo se lee su propio texto, no los menús que lo rodean.
- **Pregunta antes de enviar una página privada.** Una página que parece privada, como un repositorio privado de GitHub o una página de Notion o Google Docs sin publicar, no se envía a ningún modelo hasta que elijas _Solo local_ o _Enviar igualmente_. Un candado en la esquina de la página muestra y cambia el estado; tu elección se registra y puede recordarse para el sitio.
- **Varias formas de empezar.** Selecciona texto y haz clic en _Explicar_ (selecciones hechas con el puntero, el teclado o de forma táctil), pulsa `Alt+Shift+E` o usa _Explicar_ en el menú contextual. Las páginas que cargan más texto o pasan a otra página sin recargar se vuelven a escanear.
- **Tú eliges el modelo.** Gemini Nano integrado en Chrome (en tu equipo, nada que configurar), Ollama, OpenAI, Anthropic, Google Gemini, xAI Grok, DeepSeek, Qwen, Moonshot (Kimi), Zhipu GLM, Mistral, OpenRouter o cualquier servidor compatible con OpenAI. Anthropic y Gemini usan sus API nativas.

## Tu grafo de conocimiento

Cada consulta se suma a un grafo de lo que has leído, construido a partir de tu propia lectura y no de la memoria de un modelo de propósito general.

- **Los conceptos son los nodos.** `LoRA` es un solo nodo, sea cual sea la grafía que use una página (`LoRA`, `low-rank adaptation`) y en el idioma en que lo hayas encontrado. Conserva sus alias, su área y cuánto lo entendiste.
- **Las relaciones son las aristas.** Un modelo propone enlaces `variant_of`, `prerequisite` y `related` cuando consultas un término; por ejemplo, `QLoRA` es una variante de `LoRA`. Un enlace del que el modelo no estaba seguro aparece en _Posibles relaciones_ y solo se usa cuando lo confirmas. Puedes eliminar uno equivocado, fusionar dos conceptos que son el mismo, dividir un concepto que juntó dos términos distintos o añadir un alias.
- **Todo apunta a su evidencia.** Un concepto enumera cada encuentro: la página, la cita, la fecha, tu explicación y la conversación de seguimiento.
- **El grafo trabaja.** Una página que solo menciona `QLoRA` te recuerda `LoRA`, al modelo se le dice lo que ya sabes para que explique la diferencia, y el repaso se programa por concepto.
- **Es tuyo.** Exporta una carpeta de notas enlazadas (`[[enlaces]]`, un archivo por concepto) y ábrela en Obsidian para ver allí el grafo, o exporta el registro de eventos completo como JSONL.

Abre **Grafo** en el Historial para verlo como un mapa: los conceptos se colorean según cuánto los entendiste (entendido, poco firme, confuso o nuevo), con flechas para requisitos previos y variantes. Filtra por área, por comprensión o por cuándo consultaste un término por última vez. Arrastra para mover, desplaza para hacer zoom y haz clic en un concepto para abrirlo. También puedes recorrerlo mediante las páginas de concepto y, tras exportar, mediante Obsidian.

## Cómo funciona

```
 leer                explicar                recordar                 rememorar
 ────                ────────                ────────                 ─────────
 content script  →   background worker   →   registro de eventos  →  el comparador escanea la
 extrae el texto     elige un modelo según   de solo anexado          página siguiente en busca
 de la página y      la sensibilidad del     (IndexedDB), reproducido de nombres conocidos,
 sigue tu selección  sitio, transmite la     en conceptos, alias y    elige los conceptos que
                     respuesta y resuelve    encuentros               vale la pena mostrar y
                     el concepto                                      dibuja subrayado + tarjeta
```

1. **Leer.** Un content script extrae el texto legible de la página (estructura LaTeXML en arXiv, Readability en el resto) y mantiene un mapa de los desplazamientos del texto a los nodos del DOM.
2. **Explicar.** El background worker comprueba las reglas del sitio, elige un modelo, aplica un límite de uso local y envía el término con su párrafo. El prompt enumera los conceptos conocidos como candidatos para que el modelo pueda decir «este es el mismo concepto que c1». La respuesta se analiza de forma tolerante: se aceptan tarjetas truncadas, comas finales y etiquetas decoradas.
3. **Recordar.** El resultado se convierte en eventos (`concept.created`, `encounter.created`, `edge.proposed`, ...). Los conceptos, alias y fusiones se derivan reproduciendo el registro y nunca se almacenan, así que una mejor regla de coincidencia mejora también los registros antiguos.
4. **Rememorar.** En cada página, un comparador Aho-Corasick escanea el texto en busca de todos los nombres y abreviaturas conocidos. Después, la selección de reencuentros aplica las reglas que la mantienen útil: no en la página donde consultaste el término, no dentro de un intervalo mínimo, los conceptos silenciados siguen silenciados, y una abreviatura ambigua necesita un segundo término de la misma área en la página.

## Instalación

Instala Harkback desde [Chrome Web Store](https://chromewebstore.google.com/detail/joancadfahbgmadnjldekohffbffmodo). La página de bienvenida se abre al instalar.

Si prefieres ejecutarlo desde el código fuente, necesitas Node 22 o posterior y [pnpm](https://pnpm.io):

```sh
# desde la raíz del repositorio
pnpm install
pnpm --filter @harkback/extension build
```

Abre `chrome://extensions`, activa el **modo de desarrollador**, elige **Cargar descomprimida** y selecciona `apps/extension/.output/chrome-mv3`. La página de bienvenida se abre al instalar.

**Microsoft Edge.** Ejecuta `pnpm build -b edge` en `apps/extension` (o `pnpm zip:edge`), abre `edge://extensions`, activa el **modo de desarrollador**, elige **Cargar descomprimida** y selecciona `apps/extension/.output/edge-mv3`. Es posible que Edge no ofrezca el modelo integrado de Chrome; elige otro modelo en la configuración.

## Conectar un modelo

La bienvenida tiene tres pasos: **Bienvenida** (un ejemplo de aviso de reencuentro y una explicación de ejemplo incluida que puedes probar sin llamar a ningún modelo), **Privacidad** (adónde va tu texto; debes marcar la casilla de consentimiento para que _Siguiente_ se active) y **Modelo** (elige un proveedor y pulsa _Finalizar_). Volver a ejecutar la bienvenida actualiza el modelo que ya tienes en lugar de añadir una copia. Si sales de la configuración antes de terminarla, la página de ajustes lo indica y enlaza para retomarla. Más tarde puedes añadir más modelos y cambiar opciones en la página de ajustes, que también define los límites de uso, los avisos de reencuentro y cuánto tiempo puede quedarse en silencio un modelo antes de abandonar una solicitud.

![La página de ajustes con un modelo: nombre, modelo, dirección, clave de API y un botón Probar conexión](assets/settings.png)

| Proveedor                      | Base URL                                            | Notas                                                                                                                                                                 |
| ------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ollama                         | `http://127.0.0.1:11434/v1`                         | Local, sin clave. Ver más abajo.                                                                                                                                      |
| Chrome integrado (Gemini Nano) | ninguna                                             | En este equipo, sin clave. Descárgalo en la configuración o en los ajustes. Es un modelo pequeño: más lento que uno en la nube, y mejor en inglés, español y japonés. |
| OpenAI                         | `https://api.openai.com/v1`                         | Necesita una clave de API.                                                                                                                                            |
| Anthropic                      | `https://api.anthropic.com/v1`                      | Necesita una clave de API.                                                                                                                                            |
| Google Gemini                  | `https://generativelanguage.googleapis.com/v1beta`  | Necesita una clave de API.                                                                                                                                            |
| xAI Grok                       | `https://api.x.ai/v1`                               | Necesita una clave de API.                                                                                                                                            |
| DeepSeek                       | `https://api.deepseek.com`                          | Necesita una clave de API.                                                                                                                                            |
| Qwen (Alibaba Cloud)           | `https://dashscope.aliyuncs.com/compatible-mode/v1` | Necesita una clave de API. Una clave solo funciona en la región donde se creó; edita la dirección para la otra región.                                                |
| Moonshot (Kimi)                | `https://api.moonshot.ai/v1`                        | Necesita una clave de API. Una clave solo funciona en la región donde se creó; edita la dirección para la otra región.                                                |
| Zhipu GLM                      | `https://open.bigmodel.cn/api/paas/v4`              | Necesita una clave de API.                                                                                                                                            |
| Mistral                        | `https://api.mistral.ai/v1`                         | Necesita una clave de API.                                                                                                                                            |
| OpenRouter                     | `https://openrouter.ai/api/v1`                      | Necesita una clave de API.                                                                                                                                            |
| Personalizado                  | cualquier dirección                                 | `https`, salvo en este equipo y en tu propia red (`192.168.x.x`, `10.x.x.x`, `name.local`, Tailscale).                                                                |

Cada proveedor habla su propio formato: Anthropic y Google Gemini usan sus API nativas, y todo lo demás, incluidos Ollama, Grok, DeepSeek, Qwen, Moonshot, Zhipu, Mistral, OpenRouter y cualquier dirección personalizada como un proxy de empresa, usa el formato compatible con OpenAI. Al elegir un proveedor se rellena su dirección, que aun así puedes editar. Elige **Personalizado** para cualquier otro servicio compatible con OpenAI.

Chrome te pide permiso para acceder a la dirección del modelo la primera vez que lo pruebas o lo guardas. Si lo rechazas, la tarjeta de explicación lo indica en lugar de fallar con un error de red.

**Ollama** rechaza las solicitudes de extensiones del navegador a menos que se permita el origen de la extensión. El botón _Probar conexión_ muestra el comando exacto para tu sistema, por ejemplo en macOS:

```sh
launchctl setenv OLLAMA_ORIGINS "chrome-extension://<your-extension-id>"
```

y luego reinicia Ollama.

## Usar Harkback

| Quieres                                          | Haz esto                                                                                                                                                                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Explicar un término                              | Selecciónalo y haz clic en **Explicar**, o pulsa `Alt+Shift+E`.                                                                                                                                                                                        |
| Preguntar más                                    | Usa **Preguntar más** en la tarjeta. La pregunta y la respuesta se guardan con la explicación.                                                                                                                                                         |
| Escanear una página que no es de arXiv           | Haz clic en el botón de la barra de herramientas, o permite el sitio en _Sitios_ en los ajustes para escaneos automáticos.                                                                                                                             |
| Leer un PDF                                      | Haz clic en el botón de la barra de herramientas sobre el PDF: los artículos de arXiv se abren como HTML, los demás PDF en el lector.                                                                                                                  |
| Ver lo que has consultado                        | Abre la página del historial desde la página de ajustes o la de bienvenida, o haz clic derecho en el icono de la barra de herramientas → **Historial**. Se actualiza en vivo, y el título de la fuente de cada entrada enlaza con la página de origen. |
| Repasar los términos pendientes                  | Página del historial → **Repasar**, o clic derecho en el icono de la barra de herramientas → **Repaso**.                                                                                                                                               |
| Corregir un término unido al concepto equivocado | Página del concepto → **Dividir…**: marca las consultas y los nombres que pertenecen a otro concepto y ponle nombre al nuevo.                                                                                                                          |
| Aportar al bien común de datos                   | Página del historial → **Aportar**: revisa el archivo y luego **Guardar el archivo de aportación**. No se sube nada.                                                                                                                                   |
| Conservar tus registros                          | Página del historial → **Exportar Markdown**, **Exportar tarjetas de Anki** o **Hacer copia JSONL ahora**.                                                                                                                                             |
| Restaurar desde una copia de seguridad           | Página del historial → **Importar JSONL**.                                                                                                                                                                                                             |
| Ver cómo se conectan los conceptos               | Página del historial → **Grafo**.                                                                                                                                                                                                                      |
| Dejar de subrayar un término                     | Pasa el cursor sobre el subrayado → **No volver a mostrar**.                                                                                                                                                                                           |
| Mantener una fuente fuera de modelos remotos     | Tarjeta → **Marcar la fuente como sensible**, o añade una regla de sensibilidad para el sitio en los ajustes.                                                                                                                                          |
| Resolver una página que parece privada           | El candado en la esquina de la página, o la pregunta de tu primera explicación: **Solo local** o **Enviar igualmente**.                                                                                                                                |

## Documentación

La carpeta [`guide/`](guide/README.md) tiene los detalles (en inglés, salvo la [guía de inicio](guide/es/getting-started.md)):

- [Primeros pasos](guide/es/getting-started.md), la [guía de usuario](guide/user-guide.md), [modelos y proveedores](guide/models.md) y [solución de problemas](guide/troubleshooting.md).
- [Privacidad y fuentes sensibles](guide/privacy.md): qué se envía, qué nunca se envía y cómo se garantiza.
- [Arquitectura](guide/architecture.md) y el [formato de datos](guide/data-format.md), para quienes contribuyen y para quienes quieren construir sobre tus registros.
- El [registro de cambios](CHANGELOG.md).

## Privacidad

- Cuando pides una explicación, el texto seleccionado, su párrafo, la sección y el título de la página van al servicio de modelo que configuraste, bajo los términos de ese proveedor.
- En el repaso, el botón opcional **Comprobar mi respuesta** envía el término, tu respuesta escrita y su explicación guardada a tu modelo, solo cuando lo pulsas. Desactívalo en los ajustes y el botón no aparece nunca. Sigue las mismas reglas de modelo y de fuentes sensibles que una explicación.
- Los registros se quedan en este navegador. Las copias de seguridad contienen solo registros, nunca ajustes ni claves de API.
- Las páginas se escanean automáticamente solo en arxiv.org. En cualquier otro sitio debes hacer clic en el botón, pulsar `Alt+Shift+E` o permitir el sitio.
- El contenido de una fuente sensible nunca se envía a un modelo no local, tampoco como contexto para comparaciones posteriores. Un servidor de tu propia red cuenta como no local. Una fuente sigue siendo sensible hasta que la marques como normal en su entrada del Historial.
- Una página que parece privada (un repositorio privado de GitHub; una página de Notion o Google Docs sin publicar) no se envía a ningún modelo hasta que elijas. De las páginas que el sitio no marca en ningún sentido se pregunta en Notion y Google Docs, y no en GitHub. Lo que una página sugiere sobre sí misma es solo una pista, así que marca un sitio como sensible cuando importe.
- Un ajuste deja las fuentes sensibles fuera de copias de seguridad y exportaciones. Una copia así no recuerda qué fuentes eran sensibles, y las reglas de sitio nunca están en las copias.
- **Aportar** en el Historial guarda un archivo anónimo en tu equipo, solo de artículos con licencia abierta y nunca de una fuente sensible. No se sube nada; tú decides si lo envías a algún sitio.
- Las ventanas privadas explican, pero nunca registran, escanean ni muestran reencuentros.
- Los subrayados de reencuentro viven en la página, así que los scripts de la propia página podrían inferir de qué términos tienes registros.
- Borrar una explicación la elimina de la aplicación y borra su texto del registro; el nombre del término y el título y la dirección de la fuente se conservan. Pueden quedar rastros en el disco y las copias exportadas no se pueden recuperar.
- Las claves de API se guardan **sin cifrar** en el almacenamiento de la extensión.

Las notas que muestra la extensión son la fuente de referencia: [`apps/extension/src/lib/pages/privacy.ts`](apps/extension/src/lib/pages/privacy.ts).

## Tus datos

Todo es un evento en un registro de solo anexado. El formato es público:

- Tipos de evento y cargas: [`packages/spec`](packages/spec), con el [esquema JSON](packages/spec/schema/event.schema.json) generado.
- Reproducción, coincidencia y exportación: [`packages/core`](packages/core), que no tiene dependencias del navegador y puede usarse por sí solo.

Como los conceptos y los alias se derivan del registro, tu copia de seguridad JSONL es una copia completa y portable de lo que sabes.

## Limitaciones

- Chrome y Microsoft Edge (Manifest V3). Firefox y Safari no son compatibles. El modelo integrado de Chrome no está disponible en todos los navegadores; Edge necesita otro modelo.
- Las explicaciones dependen del modelo que elijas; los modelos locales pequeños pueden producir tarjetas de concepto más débiles, lo que reduce la calidad de los reencuentros pero nunca estropea el registro.
- El texto del visor de PDF integrado en el navegador no se puede leer, así que Harkback abre el PDF en su propio lector (los artículos de arXiv van a la versión HTML). Los PDF escaneados se leen con OCR en tu equipo (el inglés viene incluido; los demás idiomas son una descarga cada uno desde `jsdelivr.net`), lo que es más lento y menos exacto que el texto real, no recupera manuscritos, fórmulas ni tablas, y la detección de párrafos en diseños complicados (tablas, figuras con texto, tres o más columnas) es aproximada. Un PDF de tu equipo necesita dos aprobaciones: activa «Permitir acceso a URL de archivos» para Harkback en `chrome://extensions` y luego, la primera vez, haz clic en «Permitir archivos locales» en la página del lector.
- La coincidencia automática de abreviaturas necesita al menos tres palabras en el nombre completo (`LLM` de `Large Language Model`). Dos abreviaturas que corresponden a nombres completos distintos en la misma área (por ejemplo, dos «GNN» diferentes) se mantienen como conceptos separados.
- Los nombres en chino, y los nombres en japonés escritos solo con kanji, de tres o más caracteres se subrayan dondequiera que aparezcan. Un nombre de dos caracteres han solo se subraya donde el diccionario del navegador lo reconoce como una palabra independiente en la página, lo que requiere un navegador con `Intl.Segmenter`; un nombre de un solo carácter nunca se subraya. Los nombres con kana o hangul necesitan dos caracteres. Las grafías simplificada y tradicional de los caracteres técnicos comunes cuentan como un solo término. No se reconoce el katakana de ancho medio con la marca de sonorización separada.
- YouTube: solo se leen las páginas `www.youtube.com/watch` con los subtítulos (CC) activados, y solo están disponibles como contexto las líneas de subtítulos que el reproductor ha mostrado desde que se abrió la página. Los subtítulos automáticos se comparan con más margen que las páginas, pero un término que se oyó como algo muy distinto (`lower` por LoRA) no coincide con tus registros. No se admiten Shorts, los reproductores incrustados en otros sitios ni el modo de pantalla completa (el reproductor oculta los avisos de Harkback; usa el modo cine), y un cambio de YouTube en su página puede impedir la lectura de subtítulos hasta que se actualice Harkback.
- GitHub, Notion y Google Docs: solo se leen las páginas principales de repositorios, los issues y pull requests (no los archivos de código), las páginas de Notion y los documentos de Google en su vista publicada o móvil. Notion solo muestra los bloques que ya ha dibujado, así que una página larga puede leerse en parte. El editor de Google Docs dibuja su texto y no se puede leer, y la vista previa no se ha comprobado. Estos sitios cambian su diseño sin avisar; cuando Harkback ya no reconoce uno, lee la página como cualquier otra hasta que se actualice.
- Los acentos se ignoran al comparar («résumé» y «resume» son un solo término), pero no hay lematización para idiomas distintos del inglés, así que las formas flexionadas, como los plurales en alemán, son términos distintos. En árabe se ignoran los signos vocálicos, la línea de alargamiento y las variantes de escritura de alef, ya y ta marbuta, y un nombre también se subraya con los prefijos de una letra y de artículo (`و`, `ب`, `ل`, `ك`, `ف`, `ال`, `بال`, `وال`) y con las terminaciones habituales de plural y de pronombre; no se reconocen otras flexiones.
- La interfaz está en inglés por defecto y también está disponible en chino simplificado y tradicional, japonés, coreano, español, francés, alemán, portugués de Brasil y árabe (de derecha a izquierda; traducido automáticamente, aún sin revisión de un hablante nativo). Las explicaciones pueden escribirse en 16 idiomas, que se eligen por separado en los ajustes. Las notas y el Markdown exportados usan solo etiquetas en inglés o chino.

## Estructura del repositorio

| Ruta             | Qué es                                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/spec`  | El formato de eventos: constantes, esquemas zod y el esquema JSON generado.                                                                                             |
| `packages/core`  | Lógica pura: reproducción, normalización de nombres, coincidencia de conceptos, selección de reencuentros, prompts, análisis de salida, exportación a JSONL y Markdown. |
| `apps/extension` | La extensión de Chrome, construida con [WXT](https://wxt.dev): content script, background worker, historial, ajustes y bienvenida.                                      |
| `tools/lint`     | Configuración de ESLint.                                                                                                                                                |
| `tools/eval`     | `pnpm eval`: mide la calidad de las explicaciones con un modelo real sobre un conjunto etiquetado de pasajes.                                                           |
| `guide`          | La documentación: guía de usuario, modelos, privacidad, arquitectura, formato de datos.                                                                                 |

## Desarrollo

```sh
pnpm install
pnpm --filter @harkback/extension dev     # recarga en vivo
```

Antes de abrir un pull request:

```sh
pnpm typecheck     # todos los paquetes
pnpm lint          # ESLint
pnpm test          # pruebas unitarias
pnpm check:build   # build de producción: permisos del manifest y tamaño del content script (menos de 130 KB)
pnpm e2e           # pruebas de extremo a extremo en Chromium (ejecuta una vez `pnpm exec playwright install chromium`)
pnpm format:check  # formato
```

Para empaquetar una versión para Microsoft Edge Add-ons, ejecuta `pnpm zip:edge` (consulta `store/edge/README.md`). Para empaquetar una versión para Chrome Web Store, sube `version` en `apps/extension/package.json` y luego ejecuta `pnpm release`. Ejecuta las comprobaciones, construye la extensión de producción, verifica el paquete y escribe `apps/extension/.output/harkback-<version>-chrome.zip`. Usa `tools/package.sh --skip-checks` para construir solo el zip.

Las pruebas de extremo a extremo cargan la extensión compilada en Chromium, sirven páginas de arXiv desde `apps/extension/fixtures` y hablan con un servidor de modelo simulado local. Cubren todo el ciclo: leer un artículo, explicar, registrar, la página del historial y los reencuentros en otros artículos. Consulta `apps/extension/e2e`.

Cuando cambies el prompt, el analizador de respuestas o el comparador, `pnpm eval` mide la calidad de las explicaciones con un modelo real y comprueba los criterios de publicación. Consulta [CONTRIBUTING.md](CONTRIBUTING.md#measuring-explanation-quality).

## Contribuir

Los informes de errores y los pull requests son bienvenidos. Lee primero [CONTRIBUTING.md](CONTRIBUTING.md). Para informar de un problema de seguridad, consulta [SECURITY.md](SECURITY.md).

## Licencia

[Apache-2.0](LICENSE)
