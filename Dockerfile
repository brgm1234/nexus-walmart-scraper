FROM apify/actor-node:20

COPY package.json ./
RUN npm install --production

COPY . ./

CMD ["node", "src/main.js"]