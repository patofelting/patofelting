{
  "rules": {
    "blog": {
      "comments": {
        "$postId": {
          ".read": true,
          "$commentId": {
            ".write": "auth != null && ( !data.exists() || data.child('uid').val() === auth.uid || root.child('blog').child('admins').child(auth.uid).val() === true )",
            ".validate": "newData.hasChildren(['id','name','text','ts','uid']) && newData.child('id').isString() && newData.child('name').isString() && newData.child('name').val().length <= 40 && newData.child('text').isString() && newData.child('text').val().length > 0 && newData.child('text').val().length <= 600 && newData.child('ts').isNumber() && newData.child('uid').isString()"
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
          ".write": "auth != null && auth.uid === $uid && (newData.val() === true || !newData.exists())"
        }
      }
    }
  }
}
