---
layout: post
title:  "Bem vindo!"
date:   2016-04-28 22:30:10 -0300
categories: Ambiente
---

Vamos lá, os tempos passam e cada vez um paradigma novo se apresenta, agora vamos testar as páginas estáticas do jekyll.
Para que tanta complexidade em camadas de acessos à dados, minificação de scripts e ainda assim ele ocupando mais navegador que o Windows?
Páginas estáticas com jekyll, vamos ver como será o processo de criação destas páginas, basta get na gem jekyll e pronto, sempre que alterar um arquivo faça o pull dele e está no ar, o arquivo estático, bunito, ah sim, `jekyll serve` para funfar.

Quer um conteúdo novo? Crie uma página na pasta `_posts` e tudo certo, não se esqueça de nomeá-la com o formato `YYYY-MM-DD-nome-do-post.ext`

De quebra se liga nos snippets:

{% highlight ruby %}
def print_hi(name)
  puts "Hi, #{name}"
end
print_hi('Fran')
#=> prints 'Hi, Fran' to STDOUT.Inline function
{% endhighlight %}

Check out the [Jekyll docs][jekyll-docs] for more info on how to get the most out of Jekyll. File all bugs/feature requests at [Jekyll’s GitHub repo][jekyll-gh]. If you have questions, you can ask them on [Jekyll Talk][jekyll-talk].

[jekyll-docs]: http://jekyllrb.com/docs/home
[jekyll-gh]:   https://github.com/jekyll/jekyll
[jekyll-talk]: https://talk.jekyllrb.com/
