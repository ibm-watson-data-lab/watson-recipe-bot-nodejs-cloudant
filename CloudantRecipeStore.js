'use strict';

class CloudantRecipeStore {

    /**
     * Creates a new instance of CloudantRecipeStore.
     * @param {Object} cloudant - The instance of cloudant to connect to
     * @param {string} dbName - The name of the database to use
     */
    constructor(cloudant, dbName) {
        this.cloudant = cloudant;
        this.dbName = dbName;
        this.db = null;
    }

    /**
     * Creates and initializes the database.
     * @returns {Promise.<TResult>}
     */
    init() {
        console.log('Getting database...');
        return this.cloudant.db.list()
            .then((dbNames) => {
                var exists = false;
                for (var dbName of dbNames) {
                    if (dbName == this.dbName) {
                        exists = true;
                    }
                }
                if (!exists) {
                    console.log(`Creating database ${this.dbName}...`);
                    return this.cloudant.db.create(this.dbName);
                }
                else {
                    return Promise.resolve();
                }
            })
            .then(() => {
                this.db = this.cloudant.db.use(this.dbName);
                return Promise.resolve();
            })
            .then(() => {
                // see if the by_popularity design doc exists, if not then create it
                return this.db.find({selector: {'_id': '_design/by_popularity'}});
            })
            .then((result) => {
                if (result && result.docs && result.docs.length > 0) {
                    return Promise.resolve();
                }
                else {
                    var designDoc = {
                        _id: '_design/by_popularity',
                        views: {
                            ingredients: {
                                map: 'function (doc) {\n  if (doc.type && doc.type==\'userIngredientRequest\') {\n    emit(doc.ingredient_name, 1);\n  }\n}',
                                reduce: '_sum'
                            },
                            cuisines: {
                                map: 'function (doc) {\n  if (doc.type && doc.type==\'userCuisineRequest\') {\n    emit(doc.cuisine_name, 1);\n  }\n}',
                                reduce: '_sum'
                            },
                            recipes: {
                                map: 'function (doc) {\n  if (doc.type && doc.type==\'userRecipeRequest\') {\n    emit(doc.recipe_title, 1);\n  }\n}',
                                reduce: '_sum'
                            }
                        },
                        'language': 'javascript'
                    };
                    return this.db.insert(designDoc);
                }
            })
            .then(() => {
                // see if the by_day_of_week design doc exists, if not then create it
                return this.db.find({selector: {'_id': '_design/by_day_of_week'}});
            })
            .then((result) => {
                if (result && result.docs && result.docs.length > 0) {
                    return Promise.resolve();
                }
                else {
                    var designDoc = {
                        _id: '_design/by_day_of_week',
                        views: {
                            ingredients: {
                                map: 'function (doc) {\n  if (doc.type && doc.type==\'userIngredientRequest\') {\n    var weekdays = [\'Sunday\',\'Monday\',\'Tuesday\',\'Wednesday\',\'Thursday\',\'Friday\',\'Saturday\'];\n    emit(weekdays[new Date(doc.date).getDay()], 1);\n  }\n}',
                                reduce: '_sum'
                            },
                            cuisines: {
                                map: 'function (doc) {\n  if (doc.type && doc.type==\'userCuisineRequest\') {\n    var weekdays = [\'Sunday\',\'Monday\',\'Tuesday\',\'Wednesday\',\'Thursday\',\'Friday\',\'Saturday\'];\n    emit(weekdays[new Date(doc.date).getDay()], 1);\n  }\n}',
                                reduce: '_sum'
                            },
                            recipes: {
                                map: 'function (doc) {\n  if (doc.type && doc.type==\'userRecipeRequest\') {\n    var weekdays = [\'Sunday\',\'Monday\',\'Tuesday\',\'Wednesday\',\'Thursday\',\'Friday\',\'Saturday\'];\n    emit(weekdays[new Date(doc.date).getDay()], 1);\n  }\n}',
                                reduce: '_sum'
                            }
                        },
                        'language': 'javascript'
                    };
                    return this.db.insert(designDoc);
                }
            })
            .catch((err) => {
                console.log(`Cloudant error: ${JSON.stringify(err)}`);
            });
    }

    // User

    /**
     * Adds a new user to Cloudant if a user with the specified ID does not already exist.
     * @param userId - The ID of the user (typically the ID returned from Slack)
     * @returns {Promise.<TResult>}
     */
    addUser(userId) {
        var userDoc = {
            type: 'user',
            name: userId
        }
        return this.addDocIfNotExists(userDoc, 'name')
    }

    // Ingredients

    /**
     * Gets the unique name for the ingredient to be stored in Cloudant.
     * @param ingredientsStr - The ingredient or comma-separated list of ingredients specified by the user
     * @returns {string}
     */
    getUniqueIngredientsName(ingredientsStr) {
        var ingredients = ingredientsStr.trim().toLowerCase().split(',');
        for (var i = 0; i < ingredients.length; i++) {
            ingredients[i] = ingredients[i].trim();
        }
        ingredients.sort();
        return ingredients.join(',');
    }

    /**
     * Finds the ingredient based on the specified ingredientsStr in Cloudant.
     * @param ingredientsStr - The ingredient or comma-separated list of ingredients specified by the user
     * @returns {Promise.<TResult>}
     */
    findIngredient(ingredientsStr) {
        return this.findDoc('ingredient', 'name', this.getUniqueIngredientsName(ingredientsStr));
    }

    /**
     * Adds a new ingredient to Cloudant if an ingredient based on the specified ingredientsStr does not already exist.
     * @param ingredientsStr - The ingredient or comma-separated list of ingredients specified by the user
     * @param matchingRecipes - The recipes that match the specified ingredientsStr
     * @param userDoc - The existing Cloudant doc for the user
     * @returns {Promise.<TResult>}
     */
    addIngredient(ingredientsStr, matchingRecipes, userDoc) {
        var ingredientDoc = {
            type: 'ingredient',
            name: this.getUniqueIngredientsName(ingredientsStr),
            recipes: matchingRecipes
        };
        return this.addDocIfNotExists(ingredientDoc, 'name')
            .then((doc) => {
                return this.recordIngredientRequestForUser(doc, userDoc)
                    .then(() => {
                        return Promise.resolve(doc);
                    });
            });
    }

    /**
     * Records the request by the user for the specified ingredient.
     * Stores the ingredient and the number of times it has been accessed in the user doc.
     * @param ingredientDoc - The existing Cloudant doc for the ingredient
     * @param userDoc - The existing Cloudant doc for the user
     * @returns {Promise.<TResult>}
     */
    recordIngredientRequestForUser(ingredientDoc, userDoc) {
        return this.db.get(userDoc._id)
            .then((latestUserDoc) => {
                // add or update the ingredient and count in the user doc
                if (! latestUserDoc.ingredients) {
                    latestUserDoc.ingredients = [];
                }
                var userIngredient = null;
                for (var ingredient of latestUserDoc.ingredients) {
                    if (ingredient.name == ingredientDoc.name) {
                        userIngredient = ingredient;
                        break;
                    }
                }
                if (! userIngredient) {
                    userIngredient = {
                        name: ingredientDoc.name
                    };
                    latestUserDoc.ingredients.push(userIngredient);
                }
                if (! userIngredient.count) {
                    userIngredient.count = 0;
                }
                userIngredient.count += 1;
                return this.db.insert(latestUserDoc);
            })
            .then((updatedUserDoc) => {
                // add a new doc with the user/ingredient details
                var userIngredientDoc = {
                    type: 'userIngredientRequest',
                    user_id: userDoc._id,
                    user_name: userDoc['name'],
                    ingredient_id: ingredientDoc._id,
                    ingredient_name: ingredientDoc['name'],
                    date: Date.now()
                };
                return this.db.insert(userIngredientDoc)
                    .then(() => {
                        return Promise.resolve(updatedUserDoc);
                    });
            });
    }

    // Cuisine

    /**
     * Gets the unique name for the cuisine to be stored in Cloudant.
     * @param cuisine - The cuisine specified by the user
     * @returns {string}
     */
    getUniqueCuisineName(cuisine) {
        return cuisine.trim().toLowerCase();
    }

    /**
     * Finds the cuisine with the specified name in Cloudant.
     * @param cuisine - The cuisine specified by the user
     * @returns {Promise.<TResult>}
     */
    findCuisine(cuisine) {
        return this.findDoc('cuisine', 'name', this.getUniqueCuisineName(cuisine));
    }

    /**
     * Adds a new cuisine to Cloudant if a cuisine with the specified name does not already exist.
     * @param cuisine - The cuisine specified by the user
     * @param matchingRecipes - The recipes that match the specified cuisine
     * @param userDoc - The existing Cloudant doc for the user
     * @returns {Promise.<TResult>}
     */
    addCuisine(cuisine, matchingRecipes, userDoc) {
        var cuisineDoc = {
            type: 'cuisine',
            name: this.getUniqueCuisineName(cuisine),
            recipes: matchingRecipes
        };
        return this.addDocIfNotExists(cuisineDoc, 'name')
            .then((doc) => {
                return this.recordCuisineRequestForUser(doc, userDoc)
                    .then(() => {
                        return Promise.resolve(doc);
                    });
            });
    }

    /**
     * Records the request by the user for the specified cuisine.
     * Stores the cuisine and the number of times it has been accessed in the user doc.
     * @param cuisineDoc - The existing Cloudant doc for the cuisine
     * @param userDoc - The existing Cloudant doc for the user
     * @returns {Promise.<TResult>}
     */
    recordCuisineRequestForUser(cuisineDoc, userDoc) {
        return this.db.get(userDoc._id)
            .then((latestUserDoc) => {
                if (! latestUserDoc.cuisines) {
                    latestUserDoc.cuisines = [];
                }
                var userCuisine = null;
                for (var cuisine of latestUserDoc.cuisines) {
                    if (cuisine.name == cuisineDoc.name) {
                        userCuisine = cuisine;
                        break;
                    }
                }
                if (! userCuisine) {
                    userCuisine = {
                        name: cuisineDoc.name
                    };
                    latestUserDoc.cuisines.push(userCuisine);
                }
                if (! userCuisine.count) {
                    userCuisine.count = 0;
                }
                userCuisine.count += 1;
                return this.db.insert(latestUserDoc);
            })
            .then((updatedUserDoc) => {
                // add a new doc with the user/cuisine details
                var userCuisineDoc = {
                    type: 'userCuisineRequest',
                    user_id: userDoc._id,
                    user_name: userDoc['name'],
                    cuisine_id: cuisineDoc._id,
                    cuisine_name: cuisineDoc['name'],
                    date: Date.now()
                };
                return this.db.insert(userCuisineDoc)
                    .then(() => {
                        return Promise.resolve(updatedUserDoc);
                    });
            });
    }

    // Recipe

    /**
     * Gets the unique name for the recipe to be stored in Cloudant.
     * @param recipeId - The ID of the recipe (typically the ID of the recipe returned from Spoonacular)
     * @returns {string}
     */
    getUniqueRecipeName(recipeId) {
        return `${recipeId}`.trim().toLowerCase();
    }

    /**
     * Finds the recipe with the specified ID in Cloudant.
     * @param recipeId - The ID of the recipe (typically the ID of the recipe returned from Spoonacular)
     * @returns {Promise.<TResult>}
     */
    findRecipe(recipeId) {
        return this.findDoc('recipe', 'name', this.getUniqueRecipeName(recipeId));
    }

    /**
     * Finds the user's favorite recipes in Cloudant.
     * @param userDoc - The existing Cloudant doc for the user
     * @param count - The max number of recipes to return
     * @returns {Promise.<TResult>}
     */
    findFavoriteRecipesForUser(userDoc, count) {
        return this.db.get(userDoc._id)
            .then((latestUserDoc) => {
                if (latestUserDoc.recipes) {
                    var recipes = latestUserDoc.recipes;
                    recipes.sort((recipe1, recipe2) => {
                        return recipe1.count - recipe2.count; // reverse sort
                    });
                    return Promise.resolve(recipes.slice(0,Math.min(recipes.length,count)))
                }
                else {
                    return Promise.resolve([]);
                }
            });
    }

    /**
     * Adds a new recipe to Cloudant if a recipe with the specified name does not already exist.
     * @param recipeId - The ID of the recipe (typically the ID of the recipe returned from Spoonacular)
     * @param recipeTitle - The title of the recipe
     * @param recipeDetail - The detailed instructions for making the recipe
     * @param ingredientCuisineDoc - The existing Cloudant doc for either the ingredient or cuisine selected before the recipe
     * @param userDoc - The existing Cloudant doc for the user
     * @returns {Promise.<TResult>}
     */
    addRecipe(recipeId, recipeTitle, recipeDetail, ingredientCuisineDoc, userDoc) {
        var recipeDoc = {
            type: 'recipe',
            name: this.getUniqueRecipeName(recipeId),
            title: recipeTitle.trim().replace(/'/g, '\\\''),
            instructions: recipeDetail
        };
        return this.addDocIfNotExists(recipeDoc, 'name')
            .then((doc) => {
                return this.recordRecipeRequestForUser(recipeDoc, ingredientCuisineDoc, userDoc)
                    .then(() => {
                        return Promise.resolve(doc);
                    });
            });
    }

    /**
     * Records the request by the user for the specified recipe.
     * Stores the recipe and the number of times it has been accessed in the user doc.
     * @param recipeDoc - The existing Cloudant doc for the recipe
     * @param ingredientCuisineDoc - The existing Cloudant doc for either the ingredient or cuisine selected before the recipe
     * @param userDoc - The existing Cloudant doc for the user
     * @returns {Promise.<TResult>}
     */
    recordRecipeRequestForUser(recipeDoc, ingredientCuisineDoc, userDoc) {
        return this.db.get(userDoc._id)
            .then((latestUserDoc) => {
                if (! latestUserDoc.recipes) {
                    latestUserDoc.recipes = [];
                }
                var userRecipe = null;
                for (var recipe of latestUserDoc.recipes) {
                    if (recipe.id == recipeDoc.name) {
                        userRecipe = recipe;
                        break;
                    }
                }
                if (! userRecipe) {
                    userRecipe = {
                        id: recipeDoc.name,
                        title: recipeDoc.title,
                    };
                    latestUserDoc.recipes.push(userRecipe);
                }
                if (! userRecipe.count) {
                    userRecipe.count = 0;
                }
                userRecipe.count += 1;
                return this.db.insert(latestUserDoc);
            })
            .then((updatedUserDoc) => {
                // add a new doc with the user/recipe details
                var userRecipeDoc = {
                    type: 'userRecipeRequest',
                    user_id: userDoc._id,
                    user_name: userDoc['name'],
                    recipe_id: recipeDoc._id,
                    recipe_title: recipeDoc['title'],
                    date: Date.now()
                };
                return this.db.insert(userRecipeDoc)
                    .then(() => {
                        return Promise.resolve(updatedUserDoc);
                    });
            });
    }

    // Cloudant Helper Methods

    /**
     * Finds a doc based on the specified docType, propertyName, and propertyValue.
     * @param docType - The type value of the document stored in Cloudant
     * @param propertyName - The property name to search for
     * @param propertyValue - The value that should match for the specified property name
     * @returns {Promise.<TResult>}
     */
    findDoc(docType, propertyName, propertyValue) {
        var selector = {
            '_id': {'$gt': 0},
            'type': docType
        };
        selector[`${propertyName}`] = propertyValue;
        return this.db.find({selector: selector})
            .then((result) => {
                if (result.docs) {
                    return Promise.resolve(result.docs[0]);
                }
                else {
                    return Promise.resolve();
                }
            });
    }

    /**
     * Adds a new doc to Cloudant if a doc with the same value for uniquePropertyName does not exist.
     * @param doc - The document to add
     * @param uniquePropertyName - The name of the property used to search for an existing document (the value will be extracted from the doc provided)
     * @returns {Promise.<TResult>}
     */
    addDocIfNotExists(doc, uniquePropertyName) {
        var docType = doc.type;
        var propertyValue = doc[uniquePropertyName];
        return this.findDoc(docType, uniquePropertyName, propertyValue)
            .then((existingDoc) => {
                if (existingDoc) {
                    console.log(`Returning ${docType} doc where ${uniquePropertyName}=${propertyValue}`);
                    return Promise.resolve(existingDoc);
                }
                else {
                    console.log(`Creating ${docType} doc where ${uniquePropertyName}=${propertyValue}`);
                    return this.db.insert(doc)
                        .then((body) => {
                            doc._id = body.id;
                            doc._rev = body.rev;
                            return Promise.resolve(doc);
                        });
                }
            });
    }
}

module.exports = CloudantRecipeStore;