// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyD261TL6XuBp12rUNCcMKyP7_nMaCVYc7Y",
  authDomain: "patofelting-b188f.firebaseapp.com",
  databaseURL: "https://patofelting-b188f-default-rtdb.firebaseio.com",
  projectId: "patofelting-b188f",
  storageBucket: "patofelting-b188f.appspot.com",
  messagingSenderId: "858377467588",
  appId: "1:858377467588:web:cade9de05ebccc17f87b91"
};

// Inicialización con compatibilidad
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
  
  // Exporta las instancias compatibles
  window.firebaseCompatDb = firebase.database();
  window.firebaseCompatAuth = firebase.auth();

  // Listener para estado de autenticación
  window.firebaseCompatAuth.onAuthStateChanged(user => {
    console.log('Usuario Firebase:', user ? 'Conectado' : 'Desconectado');
  });
} else {
  console.log('Firebase no disponible, usando localStorage como fallback');
}

{
  "rules": {
    "blog": {
      "comments": {
        "$postId": {
          ".read": "auth != null",
          "$commentId": {
            ".write": "auth != null && (!data.exists() || newData.child('uid').val() === auth.uid || root.child('blog').child('admins').child(auth.uid).exists())",
            ".validate": "newData.hasChildren(['id', 'name', 'text', 'ts', 'uid']) &&
              newData.child('id').isString() &&
              newData.child('name').isString() && newData.child('name').val().length >= 1 && newData.child('name').val().length <= 40 &&
              newData.child('text').isString() && newData.child('text').val().length >= 1 && newData.child('text').val().length <= 600 &&
              newData.child('ts').isNumber() &&
              newData.child('uid').val() === auth.uid"
          }
        }
      },
      "reactions": {
        "$postId": {
          ".read": true,
          "$emoji": {
            ".write": "auth != null && newData.isNumber() && newData.val() >= 0 && ( !data.exists() || newData.val() <= data.val() + 1 )"
          }
        }
      },
      "reactionsByUser": {
        "$postId": {
          "$uid": {
            ".read": "auth != null && auth.uid === $uid",
            "$emoji": {
              ".write": "auth != null && auth.uid === $uid && newData.val() === true && !data.exists()"
            }
          }
        }
      },
      "favorites": {
        "$postId": {
          "$uid": {
            ".read": "auth != null && auth.uid === $uid",
            ".write": "auth != null && auth.uid === $uid && (newData.val() === true || !newData.exists())"
          }
        }
      },
      "admins": {
        "$uid": {
          ".read": false,
          ".write": "auth != null && root.child('blog').child('admins').child(auth.uid).val() === true"
        }
      }
    }
  }
}
