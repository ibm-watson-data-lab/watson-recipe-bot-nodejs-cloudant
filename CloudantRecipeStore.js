'use strict';

class CloudantRecipeStore {

    constructor(cloudant, dbName) {
        this.cloudant = cloudant;
        this.dbName = dbName;
        this.db = null;
    }

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

    addUser(userId) {
        var userDoc = {
            type: 'user',
            name: userId
        }
        return this.addDocIfNotExists(userDoc, 'name')
    }

    // Ingredients

    getUniqueIngredientsName(ingredientsStr) {
        var ingredients = ingredientsStr.trim().toLowerCase().split(',');
        for (var i = 0; i < ingredients.length; i++) {
            ingredients[i] = ingredients[i].trim();
        }
        ingredients.sort();
        return ingredients.join(',');
    }

    findIngredient(ingredientsStr) {
        return this.findDoc('ingredient', 'name', this.getUniqueIngredientsName(ingredientsStr));
    }
    
    addIngredient(ingredientsStr, matchingRecipes, userDoc) {
        var ingredientDoc = {
            type: 'ingredient',
            name: this.getUniqueIngredientsName(ingredientsStr),
            recipes: matchingRecipes
        };
        return this.addDocIfNotExists(ingredientDoc, 'name')
            .then((doc) => {
                return this.incrementIngredientForUser(doc, userDoc)
                    .then(() => {
                        return Promise.resolve(doc);
                    });
            });
    }

    incrementIngredientForUser(ingredientDoc, userDoc) {
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

    getUniqueCuisineName(cuisine) {
        return cuisine.trim().toLowerCase();
    }

    findCuisine(cuisine) {
        return this.findDoc('cuisine', 'name', this.getUniqueCuisineName(cuisine));
    }
    
    addCuisine(cuisine, matchingRecipes, userDoc) {
        var cuisineDoc = {
            type: 'cuisine',
            name: this.getUniqueCuisineName(cuisine),
            recipes: matchingRecipes
        };
        return this.addDocIfNotExists(cuisineDoc, 'name')
            .then((doc) => {
                return this.incrementCuisineForUser(doc, userDoc)
                    .then(() => {
                        return Promise.resolve(doc);
                    });
            });
    }

    incrementCuisineForUser(cuisineDoc, userDoc) {
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

    getUniqueRecipeName(recipeId) {
        return `${recipeId}`.trim().toLowerCase();
    }

    findRecipe(recipeId) {
        return this.findDoc('recipe', 'name', this.getUniqueRecipeName(recipeId));
    }

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

    addRecipe(recipeId, recipeTitle, recipeDetail, ingredientCuisineDoc, userDoc) {
        var recipeDoc = {
            type: 'recipe',
            name: this.getUniqueRecipeName(recipeId),
            title: recipeTitle.trim().replace(/'/g, '\\\''),
            instructions: recipeDetail
        };
        return this.addDocIfNotExists(recipeDoc, 'name')
            .then((doc) => {
                return this.incrementRecipeForUser(recipeDoc, ingredientCuisineDoc, userDoc)
                    .then(() => {
                        return Promise.resolve(doc);
                    });
            });
    }

    incrementRecipeForUser(recipeDoc, ingredientCuisineDoc, userDoc) {
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