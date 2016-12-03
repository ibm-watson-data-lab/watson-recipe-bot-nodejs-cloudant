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