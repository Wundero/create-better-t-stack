FROM public.ecr.aws/lambda/microvms:al2023-minimal

RUN dnf install -y nodejs && dnf clean all

WORKDIR /app
COPY server.mjs /app/server.mjs

ENV PORT=8080
EXPOSE 8080
CMD ["node", "/app/server.mjs"]
