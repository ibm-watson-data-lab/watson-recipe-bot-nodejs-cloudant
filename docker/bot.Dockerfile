FROM node:latest
MAINTAINER Mark Watson <markwatsonatx@gmail.com>
RUN mkdir -p /usr/src/bot
COPY package.json /usr/src/bot/package.json
COPY index.js /usr/src/bot/index.js
COPY CloudantRecipeStore.js /usr/src/bot/CloudantRecipeStore.js
COPY RecipeClient.js /usr/src/bot/RecipeClient.js
COPY SousChef.js /usr/src/bot/SousChef.js
WORKDIR /usr/src/bot
RUN npm install
CMD ["node","index.js"]