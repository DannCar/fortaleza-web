#!/bin/sh
sed -i "s|%%MAPBOX_TOKEN%%|$MAPBOX_TOKEN|g" /usr/share/nginx/html/index.html
nginx -g "daemon off;"