ALTER TABLE orders ADD COLUMN subtotal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN delivery_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN delivery_rule TEXT NOT NULL DEFAULT '';
UPDATE orders SET subtotal=total;
CREATE TABLE order_history(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL REFERENCES orders(id),actor TEXT,status TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX order_history_order ON order_history(order_id,id);
UPDATE records SET data=json_set(data,'$.slug',id,'$.visible',json('true'),'$.archived',json('false'),'$.cover','','$.hero','','$.homepageVisible',json('false'),'$.homepagePriority',0,'$.seoTitle',json('{"en":"","ar":"","si":"","ta":""}'),'$.seoDescription',json('{"en":"","ar":"","si":"","ta":""}')) WHERE kind IN ('categories','collections');
UPDATE products SET data=json_set(data,'$.collections',CASE WHEN json_extract(data,'$.collection')!='' THEN json_array(json_extract(data,'$.collection')) ELSE json('[]') END,'$.badges',json('[]'),'$.sku','');
INSERT INTO records(kind,id,data) SELECT 'sections','campaign',json_object('type','hero','title',json_extract(data,'$.title'),'subtitle',json_extract(data,'$.intro'),'eyebrow',json_extract(data,'$.eyebrow'),'cta',json_extract(data,'$.cta'),'image',json_extract(data,'$.image'),'secondaryImage','/assets/product-3.webp','href','/fashion/shop','visible',json('true'),'priority',0,'layout','editorial') FROM records WHERE kind='content' AND id='fashion';
INSERT INTO records(kind,id,data) SELECT 'sections','first-edit',json_object('type','featured-products','title',json_extract(data,'$.editTitle'),'eyebrow',json_extract(data,'$.editEyebrow'),'subtitle',json('{"en":"","ar":"","si":"","ta":""}'),'cta',json('{"en":"Shop all","ar":"تسوق الكل","si":"සියල්ල බලන්න","ta":"அனைத்தையும் காண்க"}'),'href','/fashion/shop','visible',json('true'),'priority',10,'layout','grid','products',json('[]')) FROM records WHERE kind='content' AND id='fashion';
INSERT INTO records(kind,id,data) SELECT 'sections','brand-story',json_object('type','editorial-split','title',json_extract(data,'$.noteTitle'),'subtitle',json_extract(data,'$.body'),'eyebrow',json_extract(data,'$.noteEyebrow'),'cta',json_extract(data,'$.noteCta'),'image','/assets/product-4.webp','href','/about','visible',json('true'),'priority',20,'layout','split') FROM records WHERE kind='content' AND id='fashion';
UPDATE records SET data=json_set(data,'$.currency','LKR','$.customerEmailEnabled',json('true'),'$.checkoutIntro',json('{"en":"Your selection, your details. We will confirm availability and delivery with you.","ar":"","si":"","ta":""}')) WHERE kind='ordering' AND id='main';

CREATE TRIGGER protect_used_taxonomy BEFORE DELETE ON records WHEN
 (OLD.kind='categories' AND EXISTS(SELECT 1 FROM products WHERE json_extract(data,'$.category')=OLD.id)) OR
 (OLD.kind='collections' AND EXISTS(SELECT 1 FROM products WHERE json_extract(data,'$.collection')=OLD.id OR EXISTS(SELECT 1 FROM json_each(products.data,'$.collections') WHERE value=OLD.id))) OR
 (OLD.kind='badges' AND EXISTS(SELECT 1 FROM products,json_each(products.data,'$.badges') WHERE json_extract(value,'$.id')=OLD.id))
 BEGIN SELECT RAISE(ABORT,'Entry is referenced by products'); END;
