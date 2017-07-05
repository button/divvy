FROM node:6.10

RUN mkdir /app
WORKDIR /app

COPY package.json /app/
RUN npm install
COPY . /app

ENV NODE_ENV development
EXPOSE 8321

CMD /bin/bash -c 'npm start 2>&1'
