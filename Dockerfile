FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["/bin/sh", "-c", "sed -i \"s|%%MAPBOX_TOKEN%%|${MAPBOX_TOKEN}|g\" /usr/share/nginx/html/index.html && nginx -g 'daemon off;'"]