# Sitio estático (HTML/CSS/JS) servido con nginx
FROM nginx:1.27-alpine

# Configuración ligera: compresión y cabeceras básicas
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

COPY index.html estadisticas.html privacy-policy.html terms-and-conditions.html /usr/share/nginx/html/
COPY styles/ /usr/share/nginx/html/styles/
COPY scripts/ /usr/share/nginx/html/scripts/
COPY traffic/ /usr/share/nginx/html/traffic/

EXPOSE 80
