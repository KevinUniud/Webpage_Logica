FROM nginx:1.27-alpine

# Serve static website files from nginx default web root.
COPY . /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
