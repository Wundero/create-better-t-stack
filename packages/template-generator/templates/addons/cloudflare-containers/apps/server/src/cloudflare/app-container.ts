import { Container } from "@cloudflare/containers";

export class AppContainer extends Container<Env> {
  defaultPort = 80;
}
