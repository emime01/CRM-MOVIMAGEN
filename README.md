# CortaClip — Deploy en Railway

## Archivos del proyecto

```
cortaclip-web/
├── app.py           ← servidor Flask + FFmpeg
├── index.html       ← frontend
├── requirements.txt ← dependencias Python
├── Procfile         ← comando de inicio para Railway
├── nixpacks.toml    ← instala FFmpeg automáticamente
└── README.md
```

---

## Deploy paso a paso

### 1. Crear repositorio en GitHub

```bash
git init
git add .
git commit -m "CortaClip inicial"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/cortaclip.git
git push -u origin main
```

### 2. Crear proyecto en Railway

1. Entrá a **https://railway.app** y creá una cuenta (podés usar tu cuenta de GitHub)
2. Clic en **"New Project"**
3. Elegí **"Deploy from GitHub repo"**
4. Seleccioná el repositorio `cortaclip`
5. Railway detecta automáticamente el `nixpacks.toml` e instala FFmpeg
6. En unos 2-3 minutos la app está online

### 3. Configurar dominio

1. En Railway, ir a tu proyecto → **Settings → Networking**
2. Clic en **"Generate Domain"**
3. Te da una URL tipo `https://cortaclip-production.up.railway.app`

---

## Variables de entorno opcionales

En Railway → Variables, podés agregar:

| Variable | Descripción | Default |
|---|---|---|
| `MAX_FILE_MB` | Tamaño máximo de video en MB | `500` |
| `PORT` | Puerto (Railway lo setea automáticamente) | `5050` |

---

## Costos estimados en Railway

| Plan | Precio | Incluye |
|---|---|---|
| Hobby (gratis) | $0/mes | 500 horas/mes, suficiente para uso moderado |
| Pro | $20/mes | Uso ilimitado, más RAM para videos grandes |

Para procesar videos de 1-5 minutos con varios clientes, el plan gratis es suficiente para empezar.

---

## Actualizar la app

Cada vez que hagas cambios:

```bash
git add .
git commit -m "actualización"
git push
```

Railway redeploya automáticamente en ~1 minuto.
