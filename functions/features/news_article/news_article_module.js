const {FirestoreNewsRepository} = require("./infrastructure/firestore_news_repository");
const {id, publicArticle, fail} = require("./domain/news_article");
function createNewsArticleFeature({repository = new FirestoreNewsRepository()} = {}) {
  return {repository,
    async getArticle(editionId) {
      const edition = await repository.edition(id(editionId, "edition ID"));
      if (!edition) throw fail("Article was not found.", "not-found");
      const story = await repository.story(edition.storyId);
      if (!story) throw fail("Story was not found.", "not-found");
      return publicArticle(story, edition);
    }};
}
module.exports = {createNewsArticleFeature};
