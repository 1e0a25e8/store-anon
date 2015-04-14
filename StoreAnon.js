define(['store-anon-config', 'jQuery', 'CryptoJS'], function(config, $, CryptoJS) {
	return {
		storeObject: function(lookupKey, newObject, encryptionPhrase) {
			var storeThisObject = {
				storeAnonSecret: this.createSecret(),
				data: newObject
			};

			if (encryptionPhrase) {
				storeThisObject = this.encryptObject(storeThisObject, encryptionPhrase);
			}

			return this.postNewObject(lookupKey, storeThisObject);
		},

		fetchObject: function(lookupKey, decryptionPhrase) {
			//TODO: could use caching? in case objectExists has been called before?
			var deferred = $.Deferred();
			$.getJSON(config.s3url + lookupKey, (function(obj) {
				if (obj.encrypted) {
					try {
						obj = this.decryptObject(obj, decryptionPhrase);
					} catch(e) {
						deferred.reject('Incorrect decryption phrase')
					}
				}

				// unwrap from StoreAnon wrapper.
				obj = obj.data;

				deferred.resolve(obj);
			}).bind(this));
			return deferred.promise();
		},

		objectExists: function(lookupKey) {
			var deferred = $.Deferred();

			$.getJSON(config.s3url + lookupKey).done(function(obj) {
				deferred.resolve(true);
			}).fail(function(xhr) {
				if (xhr.status == 403 || xhr.status == 404) {
					deferred.resolve(false);
				} else {
					deferred.reject('error testing object existence: ' + xhr.status);
				}
			});

			return deferred.promise();
		},

		createSecret: function() {
			return Math.ceil(Math.random() * Number.MAX_SAFE_INTEGER);
		},

		encryptObject: function(clearObject, encryptionPhrase) {
			var clear = JSON.stringify(clearObject);
            var encrypted = CryptoJS.AES.encrypt(clear, encryptionPhrase);
            encrypted = encrypted.toString();
            return {
            	algo: 'AES-256',
            	encrypted: encrypted
            };
		},

		decryptObject: function(object, decryptionPhrase) {
			// objects should look like:
			// {
			//	 algo: 'AES-256' //currently only supported algo.
			//	 encrypted: 'XXXXXXXXX' 
			// }
			if (object.algo !== 'AES-256') {
				throw Error('unknown encryption algorithm: ' + object.algo);
			}
            var decrypted = CryptoJS.AES.decrypt(object.encrypted, decryptionPhrase);
            decrypted = decrypted.toString(CryptoJS.enc.Utf8);
            decrypted = JSON.parse(decrypted);
            return decrypted;
		},

		postNewObject: function(lookupKey, storeThisObject) {
			var deferred = $.Deferred();

			var fd = new FormData();
            fd.append('key', lookupKey);
            fd.append('success_action_status', 201);
            fd.append('Content-Type', 'text/json');
            fd.append('file', JSON.stringify(storeThisObject));

			var xhr = new XMLHttpRequest;
            xhr.open('POST', config.s3url);
            xhr.onreadystatechange = function(event) {
                if (event.target.readyState === 4) {
	                if (event.target.status !== 201) {
	                	deferred.reject("Unsuccessful file upload: " + event.target.status);
	                } else {
	                	console.info('StoreAnon new object: %s', config.s3url + lookupKey);
	                	deferred.resolve(lookupKey);
	                }
                }
            }
            xhr.send(fd);

            return deferred.promise();
		}
	};
});