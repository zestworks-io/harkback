# Primeros pasos

Cinco minutos desde cero hasta tu primer término recordado.

> Esta es la traducción al español de los [primeros pasos en inglés](../getting-started.md). Las demás páginas por ahora solo existen en inglés: consulta la [documentación en inglés](../README.md).

## 1. Instalar

Harkback es una extensión de Chrome (Manifest V3). Todavía no hay una ficha en la tienda, así que se carga desde el código fuente. Necesitas Node 22 o posterior y [pnpm](https://pnpm.io).

```sh
git clone https://github.com/zestworks-io/harkback.git
cd harkback
pnpm install
pnpm --filter @harkback/extension build
```

Abre `chrome://extensions`, activa el **modo de desarrollador**, elige **Cargar descomprimida** y selecciona `apps/extension/.output/chrome-mv3`. La página de bienvenida se abre sola.

Después de traer código nuevo, vuelve a compilar y pulsa el icono de recarga en la tarjeta de la extensión.

## 2. Conectar un modelo

Harkback no tiene servidor. Necesita un modelo que escriba las explicaciones, y tú eliges cuál. La página de bienvenida tiene tres pasos; un paso terminado muestra ✓ y se puede pulsar para volver a él.

1. **Bienvenida.** Mira un ejemplo de aviso de reencuentro y pulsa el término subrayado para ver cómo es una explicación. No se llama a ningún modelo.
2. **Privacidad.** Lee adónde va tu texto y marca la casilla de consentimiento. **Siguiente** sigue desactivado hasta que lo hagas.
3. **Modelo.** Elige un proveedor; la dirección se rellena sola. Pega una clave de API si el proveedor la necesita (Ollama y el modelo integrado de Chrome no la necesitan). Pulsa **Probar conexión** y Chrome preguntará si Harkback puede acceder a esa dirección; permítelo. Mientras se hace la prueba se muestran un indicador giratorio y «Conectando…», y el botón queda desactivado hasta que termine. Después pulsa **Finalizar configuración**.

**El modelo integrado de Chrome (Gemini Nano)** no necesita dirección ni clave. Al seleccionarlo aparecen el estado del modelo y un botón **Descargar modelo**; **Finalizar configuración** espera a que termine la descarga. Es un modelo pequeño que se ejecuta en tu ordenador, así que es más lento que un modelo en la nube, sobre todo en la primera solicitud, y sus respuestas son más simples. Va bien para explicaciones cortas.

Puedes añadir más modelos y cambiar opciones más tarde en la página de ajustes. Volver a ejecutar la bienvenida actualiza el modelo que ya tienes; no añade una segunda copia.

La opción gratuita más fácil es un modelo local con [Ollama](https://ollama.com). Requiere un paso extra, porque Ollama rechaza las solicitudes de las extensiones del navegador hasta que permites el origen de la extensión. El botón de prueba muestra el comando exacto para tu sistema. Consulta [Modelos y proveedores](../models.md) para ver todos los proveedores y cómo ejecutar un modelo en otro ordenador de tu red doméstica.

La interfaz empieza en inglés. Puedes cambiar su idioma, y el de las explicaciones, en la página de bienvenida o en los ajustes.

## 3. Explicar un término

1. Abre un artículo en [arxiv.org](https://arxiv.org). Las páginas de arXiv se escanean automáticamente.
2. Selecciona un término, por ejemplo `LoRA`.
3. Pulsa **Explicar** junto a la selección, o pulsa `Alt+Shift+E`.
4. Lee la respuesta mientras llega. Una etiqueta verde indica que la propia página define el término; una amarilla indica que la respuesta sale del conocimiento del modelo.
5. Pulsa **Entendido** o **Sigo confundido**. Esa respuesta es la primera nota del término y decide cuándo te lo vuelve a traer Harkback para repasarlo.

Otras formas de empezar: el menú contextual del texto seleccionado y una selección hecha con el teclado o con el tacto.

## 4. Volver a encontrar el término

Abre otro artículo que mencione `LoRA`, `low-rank adaptation` o `LoRAs`. El término aparece subrayado. Pasa el puntero por encima para ver cuándo y dónde lo consultaste y qué entendiste entonces. Puedes marcarlo como recordado, explicarlo de nuevo, comparar los dos usos o silenciarlo.

## 5. Ver lo que tienes

Abre la página **Historial** (enlazada desde los ajustes y la bienvenida). Lista cada término por concepto, con búsqueda, conversaciones de seguimiento, una cola de repaso y un grafo de cómo se conectan tus conceptos. Desde ahí también puedes exportar tus registros y restaurarlos desde una copia de seguridad.

## Leer algo que no está en arXiv

- **Una página web:** pulsa una vez el botón de la barra de herramientas. Para escanear un sitio automáticamente a partir de entonces, añádelo en _Sitios_ en los ajustes.
- **Un PDF:** pulsa el botón de la barra de herramientas en el PDF. Los PDF de arXiv se abren en su versión HTML; los demás PDF se abren en el lector propio de Harkback. Un PDF de tu ordenador necesita dos aprobaciones la primera vez; consulta [Solución de problemas](../troubleshooting.md#a-pdf-on-my-computer-will-not-open).
- **Algo confidencial:** marca antes el sitio o la fuente como sensible. Consulta [Privacidad y fuentes sensibles](../privacy.md).

## Siguiente

[Guía del usuario](../user-guide.md) · [Modelos y proveedores](../models.md) · [Solución de problemas](../troubleshooting.md)
