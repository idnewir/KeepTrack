FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .

# node:20-alpine already ships a low-privilege "node" user (uid 1000) —
# running as it instead of root removes the default root shell that would
# otherwise be available for anything running inside this container (the
# Vite dev server and its plugin/dependency chain).
RUN chown -R node:node /app
USER node

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host"]
