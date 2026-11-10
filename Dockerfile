FROM nginx:alpine

LABEL maintainer="dnd-dice-stamp"
LABEL description="Stamp text and SVG onto an STL"
LABEL version="1.0"

RUN rm -rf /usr/share/nginx/html/*

COPY index.html /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY app.js /usr/share/nginx/html/
COPY stamp.js /usr/share/nginx/html/
COPY geom2d.js /usr/share/nginx/html/
COPY samples /usr/share/nginx/html/samples
COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN chmod -R 755 /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
