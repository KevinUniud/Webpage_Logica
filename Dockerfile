FROM nginx:1.27-alpine

# Serve static website files from nginx default web root.
COPY . /usr/share/nginx/html

EXPOSE 80
