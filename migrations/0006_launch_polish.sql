UPDATE records SET data=json_set(data,'$.title.en','UniGlobe Holdings.') WHERE kind='content' AND id='home' AND json_extract(data,'$.title.en')='A world of possibility.';
CREATE INDEX products_visibility ON products(json_extract(data,'$.visible'),json_extract(data,'$.archived'),json_extract(data,'$.priority'));
CREATE INDEX orders_admin_status ON orders(archived,status,id DESC);
