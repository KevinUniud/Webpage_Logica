FROM nginx:1.27-alpine

# Copy only public assets; development files and container configuration are not web-accessible.
COPY index.html privacy.html service-worker.js favicon.ico /usr/share/nginx/html/
COPY Errori_comuni /usr/share/nginx/html/Errori_comuni
COPY esercizi /usr/share/nginx/html/esercizi
COPY grafici /usr/share/nginx/html/grafici
COPY Immagini /usr/share/nginx/html/Immagini
COPY lezioni /usr/share/nginx/html/lezioni
COPY progressi /usr/share/nginx/html/progressi
COPY ripasso /usr/share/nginx/html/ripasso
COPY strumenti /usr/share/nginx/html/strumenti
COPY scripts /usr/share/nginx/html/scripts
COPY styles /usr/share/nginx/html/styles
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

ENV API_UPSTREAM=http://host.docker.internal:5000 \
    REVIEW_UPSTREAM=http://host.docker.internal:5555

EXPOSE 80
