FROM nginx:1.30.4-alpine@sha256:97d490c12ba55b4946b01546d1c3ed324e8d41ab1c9fcb2a616aa470620e5b46

# Copy only public assets; development files and container configuration are not web-accessible.
COPY index.html privacy.html service-worker.js favicon.ico /usr/share/nginx/html/
COPY Errori_comuni /usr/share/nginx/html/Errori_comuni
COPY esercizi /usr/share/nginx/html/esercizi
# La Webpage pubblica solo la galleria e un segnaposto neutro. I grafici con
# dati aggregati vengono serviti a runtime dal servizio feedback.
COPY grafici/grafici.html grafici/placeholder.svg /usr/share/nginx/html/grafici/
COPY Immagini /usr/share/nginx/html/Immagini
COPY lezioni /usr/share/nginx/html/lezioni
COPY progressi /usr/share/nginx/html/progressi
COPY ripasso /usr/share/nginx/html/ripasso
COPY strumenti /usr/share/nginx/html/strumenti
COPY scripts /usr/share/nginx/html/scripts
COPY styles /usr/share/nginx/html/styles
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.conf /etc/nginx/security-headers.conf

ENV API_UPSTREAM=http://host.docker.internal:5000 \
    API_PROXY_TIMEOUT_SECONDS=125 \
    FEEDBACK_UPSTREAM=http://feedback:5555 \
    FEEDBACK_CHARTS_REFRESH_SECONDS=300

EXPOSE 80
