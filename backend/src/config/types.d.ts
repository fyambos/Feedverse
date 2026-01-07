/*
J'ai créé ce type pour "étendre" l'élément `Request` de Express pour utiliser des données supplémentaires de celles de base quand on effectue une requête (exemple : Informations d'un utilisateur)
*/

import { User } from "../users/userModels";

declare global {
  namespace Express {
    interface Request {
      user: User;
    }
  }
}
